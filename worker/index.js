// Worker: takes votes off the Redis queue and saves them in PostgreSQL.
const http = require("http");
const { Pool } = require("pg");
const { createClient } = require("redis");
const { parseVote } = require("./vote");

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ level, msg, time: new Date().toISOString(), ...extra }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redisUrl = process.env.REDIS_URL || "redis://redis:6379/0";
const cache = createClient({ url: redisUrl });     // normal commands
const blocking = createClient({ url: redisUrl });  // used only for BRPOP

let lastTick = Date.now();

// Health endpoint for the Docker health check.
http
  .createServer((req, res) => {
    const ok = Date.now() - lastTick < 30000;
    res.writeHead(ok ? 200 : 503).end(ok ? "ok" : "stalled");
  })
  .listen(3001);

async function rebuildResults() {
  const { rows } = await pool.query("SELECT option_id, COUNT(*) AS n FROM votes GROUP BY option_id");
  await cache.del("results");
  for (const r of rows) await cache.hSet("results", String(r.option_id), String(r.n));
  log("info", "results cache rebuilt", { options: rows.length });
}

async function saveVote({ userId, optionId }) {
  // created_at is set explicitly: a missing value made PostgreSQL reject every vote once.
  const res = await pool.query(
    `INSERT INTO votes (user_id, option_id, created_at) VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO NOTHING RETURNING id`,
    [userId, optionId]
  );
  if (res.rowCount === 1) await cache.hIncrBy("results", String(optionId), 1);
}

async function main() {
  cache.on("error", (e) => log("error", "redis error", { error: e.message }));
  blocking.on("error", (e) => log("error", "redis error", { error: e.message }));
  await Promise.all([cache.connect(), blocking.connect()]);

  for (let i = 0; ; i++) {  // wait until the API has created the tables
    try { await rebuildResults(); break; }
    catch (e) {
      if (i > 30) throw e;
      log("warn", "waiting for database", { error: e.message });
      await sleep(2000);
    }
  }
  log("info", "worker started");

  for (;;) {
    lastTick = Date.now();
    const item = await blocking.brPop("votes", 5);
    if (!item) continue;
    const vote = parseVote(item.element);
    if (!vote) { log("error", "malformed vote dropped", { raw: item.element }); continue; }
    try {
      await saveVote(vote);
      log("info", "vote saved", vote);
    } catch (e) {
      log("error", "could not save vote", { error: e.message, ...vote });
      await cache.lPush("votes:failed", item.element);  // keep it, do not lose the vote
    }
  }
}

main().catch((e) => { log("error", "worker crashed", { error: e.message }); process.exit(1); });
