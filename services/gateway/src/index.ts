import Fastify from "fastify";

const app = Fastify({ logger: true });

// GET /checkout -> orders POST /process (Phase 1)
app.get("/checkout", async (_req, reply) => {
  return reply.code(501).send({ ok: false, error: "not implemented" });
});

// GET /health -> probes orders GET /health (Phase 1)
app.get("/health", async (_req, reply) => {
  return reply.code(501).send({ status: "unimplemented", service: "gateway" });
});

app.listen({ host: "0.0.0.0", port: 3000 }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
