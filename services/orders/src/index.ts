import Fastify from "fastify";

const app = Fastify({ logger: true });
const PAYMENTS_URL = process.env.PAYMENTS_URL ?? "http://payments:3002";

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

app.post("/process", async (_req, reply) => {
  try {
    const res = await fetchWithTimeout(`${PAYMENTS_URL}/charge`, 3000, { method: "POST" });
    if (res.ok) {
      return { ok: true };
    }
  } catch {
    // timeout or network error — same 503 as a non-200 response
  }
  return reply.code(503).send({ ok: false, failing_dependency: "payments" });
});

app.get("/health", async (_req, reply) => {
  try {
    const res = await fetchWithTimeout(`${PAYMENTS_URL}/health`, 2000);
    if (res.ok) {
      return { status: "ok", service: "orders", downstream: "payments" };
    }
  } catch {
    // timeout or network error — same 503 as a non-200 response
  }
  return reply
    .code(503)
    .send({ status: "degraded", service: "orders", failing_dependency: "payments" });
});

app.listen({ host: "0.0.0.0", port: 3001 }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
