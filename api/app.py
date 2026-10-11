"""Voting API: logins, voting rules, results. Votes are queued in Redis; the worker saves them."""
import datetime
import json
import logging
import os
import time
from contextlib import contextmanager
from functools import wraps

import jwt
import psycopg2
import redis
from flask import Flask, g, jsonify, request
from psycopg2 import errors
from psycopg2.pool import ThreadedConnectionPool
from werkzeug.security import check_password_hash, generate_password_hash

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("pollhub-api")

_pool = None
_redis = None


def get_pool():
    global _pool
    if _pool is None:
        _pool = ThreadedConnectionPool(1, 10, os.environ["DATABASE_URL"])
    return _pool


def get_redis():
    global _redis
    if _redis is None:
        _redis = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://redis:6379/0"),
                                      decode_responses=True)
    return _redis


@contextmanager
def cursor():
    pool = get_pool()
    conn = pool.getconn()
    try:
        with conn, conn.cursor() as cur:  # commits or rolls back
            yield cur
    finally:
        pool.putconn(conn)


def init_db(retries=30):
    """Create tables and seed the options. Safe to run on every start."""
    schema = open(os.path.join(os.path.dirname(__file__), "schema.sql")).read()
    for attempt in range(retries):
        try:
            with cursor() as cur:
                cur.execute(schema)
                admin = os.environ.get("ADMIN_USERNAME", "").strip()
                if admin:
                    cur.execute("UPDATE users SET is_admin = TRUE WHERE username = %s", (admin,))
            log.info("database ready")
            return
        except psycopg2.OperationalError as exc:
            log.warning("database not ready (%s), retrying", exc)
            time.sleep(2)
    raise RuntimeError("database never became ready")


def create_app():
    app = Flask(__name__)
    secret = os.environ.get("JWT_SECRET", "")

    def auth_required(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            header = request.headers.get("Authorization", "")
            if not header.startswith("Bearer "):
                return jsonify(error="Login required"), 401
            try:
                claims = jwt.decode(header[7:], secret, algorithms=["HS256"])
                g.user_id = int(claims["sub"])
            except (jwt.PyJWTError, KeyError, ValueError):
                return jsonify(error="Invalid or expired token"), 401
            return fn(*args, **kwargs)
        return wrapper

    def admin_required(fn):
        @wraps(fn)
        def checked(*args, **kwargs):
            with cursor() as cur:  # checked in the database on every request
                cur.execute("SELECT is_admin FROM users WHERE id = %s", (g.user_id,))
                row = cur.fetchone()
            if not row or not row[0]:
                return jsonify(error="Admin only"), 403
            return fn(*args, **kwargs)
        return auth_required(checked)

    @app.get("/api/health")
    def health():
        return jsonify(status="ok")

    @app.post("/api/register")
    def register():
        body = request.get_json(silent=True) or {}
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", ""))
        if not 3 <= len(username) <= 32:
            return jsonify(error="Username must be 3-32 characters"), 400
        if len(password) < 8:
            return jsonify(error="Password must be at least 8 characters"), 400
        try:
            with cursor() as cur:
                cur.execute("INSERT INTO users (username, password_hash, is_admin) VALUES (%s, %s, %s)",
                            (username, generate_password_hash(password),
                             username == os.environ.get("ADMIN_USERNAME", "").strip()))
        except errors.UniqueViolation:
            return jsonify(error="Username already taken"), 409
        return jsonify(message="Registered"), 201

    @app.post("/api/login")
    def login():
        body = request.get_json(silent=True) or {}
        username = str(body.get("username", "")).strip()
        password = str(body.get("password", ""))
        with cursor() as cur:
            cur.execute("SELECT id, password_hash, is_admin FROM users WHERE username = %s", (username,))
            row = cur.fetchone()
        if not row or not check_password_hash(row[1], password):
            return jsonify(error="Wrong username or password"), 401
        token = jwt.encode(
            {"sub": str(row[0]), "name": username,
             "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=8)},
            secret, algorithm="HS256")
        return jsonify(token=token, username=username, is_admin=bool(row[2]))

    @app.get("/api/options")
    def options():
        with cursor() as cur:
            cur.execute("SELECT id, name FROM options ORDER BY id")
            return jsonify([{"id": r[0], "name": r[1]} for r in cur.fetchall()])

    @app.post("/api/vote")
    @auth_required
    def vote():
        body = request.get_json(silent=True) or {}
        try:
            option_id = int(body.get("option_id"))
        except (TypeError, ValueError):
            return jsonify(error="option_id is required"), 400
        with cursor() as cur:
            cur.execute("SELECT 1 FROM options WHERE id = %s", (option_id,))
            if not cur.fetchone():
                return jsonify(error="Unknown option"), 400
        r = get_redis()
        if r.sadd("voters", g.user_id) == 0:  # one vote per user
            return jsonify(error="You have already voted"), 409
        r.lpush("votes", json.dumps({"user_id": g.user_id, "option_id": option_id}))
        return jsonify(message="Vote queued"), 202

    @app.get("/api/results")
    def results():
        counts = get_redis().hgetall("results")
        with cursor() as cur:
            cur.execute("SELECT id, name FROM options ORDER BY id")
            rows = cur.fetchall()
        data = [{"id": i, "name": n, "votes": int(counts.get(str(i), 0))} for i, n in rows]
        return jsonify(results=data, total=sum(d["votes"] for d in data))

    # ---------------- admin dashboard ----------------
    @app.get("/api/admin/stats")
    @admin_required
    def admin_stats():
        with cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM users")
            users = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM votes")
            votes = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM votes WHERE created_at > NOW() - INTERVAL '1 hour'")
            last_hour = cur.fetchone()[0]
            cur.execute("""SELECT o.id, o.name, COUNT(v.id) FROM options o
                           LEFT JOIN votes v ON v.option_id = o.id GROUP BY o.id ORDER BY o.id""")
            per_option = [{"id": r[0], "name": r[1], "votes": r[2]} for r in cur.fetchall()]
            cur.execute("""SELECT u.username, o.name, v.created_at FROM votes v
                           JOIN users u ON u.id = v.user_id JOIN options o ON o.id = v.option_id
                           ORDER BY v.created_at DESC LIMIT 10""")
            recent = [{"username": r[0], "option": r[1], "time": r[2].isoformat()} for r in cur.fetchall()]
        r = get_redis()
        return jsonify(users=users, votes=votes, votes_last_hour=last_hour, per_option=per_option,
                       recent=recent, queue_pending=r.llen("votes"), queue_failed=r.llen("votes:failed"))

    @app.get("/api/admin/users")
    @admin_required
    def admin_users():
        with cursor() as cur:
            cur.execute("""SELECT u.id, u.username, u.is_admin, u.created_at, v.id IS NOT NULL
                           FROM users u LEFT JOIN votes v ON v.user_id = u.id ORDER BY u.id""")
            return jsonify([{"id": r[0], "username": r[1], "is_admin": r[2],
                             "created_at": r[3].isoformat(), "has_voted": r[4]} for r in cur.fetchall()])

    @app.post("/api/admin/options")
    @admin_required
    def admin_add_option():
        name = str((request.get_json(silent=True) or {}).get("name", "")).strip()
        if not 1 <= len(name) <= 64:
            return jsonify(error="Option name must be 1-64 characters"), 400
        try:
            with cursor() as cur:
                cur.execute("INSERT INTO options (name) VALUES (%s)", (name,))
        except errors.UniqueViolation:
            return jsonify(error="Option already exists"), 409
        return jsonify(message="Option added"), 201

    @app.delete("/api/admin/options/<int:option_id>")
    @admin_required
    def admin_delete_option(option_id):
        with cursor() as cur:
            cur.execute("SELECT 1 FROM votes WHERE option_id = %s LIMIT 1", (option_id,))
            if cur.fetchone():
                return jsonify(error="Option already has votes; reset the election first"), 409
            cur.execute("DELETE FROM options WHERE id = %s", (option_id,))
        return jsonify(message="Option deleted")

    @app.post("/api/admin/retry-failed")
    @admin_required
    def admin_retry_failed():
        r = get_redis()
        moved = 0
        while moved < 1000 and r.lmove("votes:failed", "votes", "RIGHT", "LEFT"):
            moved += 1
        log.info("admin re-queued %d failed votes", moved)
        return jsonify(message=f"Re-queued {moved} failed votes", moved=moved)

    @app.post("/api/admin/reset")
    @admin_required
    def admin_reset():
        with cursor() as cur:
            cur.execute("DELETE FROM votes")
        get_redis().delete("voters", "results", "votes", "votes:failed")
        log.info("admin reset the election (user %s)", g.user_id)
        return jsonify(message="All votes cleared")

    @app.errorhandler(Exception)
    def on_error(exc):
        log.error("unhandled error: %s", exc, exc_info=True)
        return jsonify(error="Server error"), 500

    return app


app = create_app()
