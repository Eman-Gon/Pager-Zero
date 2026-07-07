import Fastify from "fastify";
import pg from "pg";

const app = Fastify({ logger: true });

function makePool(host: string) {
  return new pg.Pool({
    host,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "postgres",
    user: process.env.PGUSER ?? "postgres",
    password: process.env.PGPASSWORD,
    max: Number(process.env.POOL_MAX ?? 5),
    connectionTimeoutMillis: 2000,
  });
}

let pool = makePool(process.env.PGHOST ?? "postgres");

app.post("/charge", async (_req, reply) => {
  try {
    await pool.query("SELECT 1");
    return { ok: true, charged: true };
  } catch {
    return reply.code(503).send({ ok: false });
  }
});

app.get("/health", async (_req, reply) => {
  try {
    await pool.query("SELECT 1");
    return { status: "ok", service: "payments" };
  } catch {
    return reply.code(503).send({ status: "degraded", service: "payments" });
  }
});

// POST /admin/fault (Phase 2/3)
app.post("/admin/fault", async (_req, reply) => {
  return reply.code(501).send({ error: "not implemented" });
});

// POST /admin/clear (Phase 2/3)
app.post("/admin/clear", async (_req, reply) => {
  return reply.code(501).send({ error: "not implemented" });
});

app.listen({ host: "0.0.0.0", port: 3002 }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
