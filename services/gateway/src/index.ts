import Fastify from "fastify";

const app = Fastify({ logger: true });
const ORDERS_URL = process.env.ORDERS_URL ?? "http://orders:3001";

async function fetchWithTimeout(url: string, timeoutMs: number, init?: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

app.get("/checkout", async (_req, reply) => {
  try {
    const res = await fetchWithTimeout(`${ORDERS_URL}/process`, 3000, { method: "POST" });
    if (res.ok) {
      return { ok: true, trace: ["gateway", "orders", "payments"] };
    }
  } catch {
    // timeout or network error — same 503 as a non-200 response
  }
  return reply
    .code(503)
    .send({ ok: false, failing_dependency: "orders", trace: ["gateway"] });
});

app.get("/health", async (_req, reply) => {
  try {
    const res = await fetchWithTimeout(`${ORDERS_URL}/health`, 2000);
    if (res.ok) {
      return { status: "ok", service: "gateway", downstream: "orders" };
    }
  } catch {
    // timeout or network error — same 503 as a non-200 response
  }
  return reply
    .code(503)
    .send({ status: "degraded", service: "gateway", failing_dependency: "orders" });
});

app.listen({ host: "0.0.0.0", port: 3000 }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
