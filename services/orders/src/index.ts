import Fastify from "fastify";

const app = Fastify({ logger: true });

// POST /process -> payments POST /charge (Phase 1)
app.post("/process", async (_req, reply) => {
  return reply.code(501).send({ ok: false, error: "not implemented" });
});

// GET /health -> probes payments GET /health (Phase 1)
app.get("/health", async (_req, reply) => {
  return reply.code(501).send({ status: "unimplemented", service: "orders" });
});

app.listen({ host: "0.0.0.0", port: 3001 }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
