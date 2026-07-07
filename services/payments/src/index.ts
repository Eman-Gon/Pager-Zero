import Fastify from "fastify";

const app = Fastify({ logger: true });

// POST /charge -> real pool query (Phase 1)
app.post("/charge", async (_req, reply) => {
  return reply.code(501).send({ ok: false, error: "not implemented" });
});

// GET /health -> SELECT 1 via pool (Phase 1)
app.get("/health", async (_req, reply) => {
  return reply.code(501).send({ status: "unimplemented", service: "payments" });
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
