import os
import sys

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("DATABASE_URL", "postgresql://x:x@localhost/x")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app  # noqa: E402

client = create_app().test_client()


def test_health():
    assert client.get("/api/health").json == {"status": "ok"}


def test_register_rejects_short_password():
    res = client.post("/api/register", json={"username": "alice", "password": "short"})
    assert res.status_code == 400


def test_register_rejects_short_username():
    res = client.post("/api/register", json={"username": "al", "password": "longenough1"})
    assert res.status_code == 400


def test_vote_requires_login():
    assert client.post("/api/vote", json={"option_id": 1}).status_code == 401


def test_vote_rejects_bad_token():
    res = client.post("/api/vote", json={"option_id": 1},
                      headers={"Authorization": "Bearer nonsense"})
    assert res.status_code == 401


def test_admin_routes_require_login():
    for method, path in [("get", "/api/admin/stats"), ("get", "/api/admin/users"),
                         ("post", "/api/admin/reset"), ("post", "/api/admin/retry-failed"),
                         ("post", "/api/admin/options"), ("delete", "/api/admin/options/1")]:
        assert getattr(client, method)(path).status_code == 401, path
