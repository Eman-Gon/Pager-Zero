// Phase 0 connectivity smoke for M3. Throwaway — proves each external dep
// works with real creds before anything is built. Legs with missing env vars
// are FLAGGED and skipped, not failed (per current no-keys state).
//
//   cd scripts/phase0-smoke && npm install && npm run smoke

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// minimal .env loader (repo root) — no dotenv dep for a throwaway script
try {
  for (const line of readFileSync(path.join(repoRoot, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env yet — rely on process env */
}

const results = [];
const pass = (leg, detail) => results.push({ leg, status: 'PASS', detail });
const fail = (leg, detail) => results.push({ leg, status: 'FAIL', detail });
const flag = (leg, detail) => results.push({ leg, status: 'FLAGGED (skipped)', detail });

// ---------- 1. Butterbase AI gateway ----------
async function butterbase() {
  const leg = 'butterbase';
  const base = (process.env.BUTTERBASE_GATEWAY_URL ?? 'https://api.butterbase.ai/v1').replace(/\/$/, '');
  const key = process.env.BUTTERBASE_API_KEY;

  // reachability check needs no auth
  const pub = await fetch(`${base}/public/models`).then((r) => r.ok).catch(() => false);
  if (!pub) return fail(leg, `${base}/public/models unreachable — wrong gateway URL?`);
  if (!key) return flag(leg, `gateway reachable at ${base} (public catalog OK), but BUTTERBASE_API_KEY not set — chat call skipped`);

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'anthropic/claude-3-haiku',
      messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
      max_tokens: 10,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return fail(leg, `chat ${res.status}: ${JSON.stringify(body.error ?? body)}`);
  pass(leg, `chat OK via ${base} — "${body.choices?.[0]?.message?.content?.trim()}"`);
}

// ---------- 2. Nebius embeddings ----------
async function nebius() {
  const leg = 'nebius';
  const base = (process.env.NEBIUS_BASE_URL ?? 'https://api.studio.nebius.com/v1').replace(/\/$/, '');
  const key = process.env.NEBIUS_API_KEY;
  const model = process.env.NEBIUS_EMBED_MODEL;
  if (!key || !model)
    return flag(leg, `NEBIUS_API_KEY / NEBIUS_EMBED_MODEL not set — embeddings call skipped (confirm model ID in Nebius dashboard)`);

  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: 'wrong-operator bug in computeTax' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return fail(leg, `embeddings ${res.status}: ${JSON.stringify(body.error ?? body)}`);
  const dim = body.data?.[0]?.embedding?.length;
  if (!dim) return fail(leg, `no embedding vector in response: ${JSON.stringify(body).slice(0, 200)}`);
  pass(leg, `model=${model} DIMENSION=${dim} <- use for the Neo4j vector index`);
}

await butterbase();
await nebius();

console.log('\n=== Phase 0 smoke results ===');
for (const r of results) console.log(`${r.status.padEnd(18)} ${r.leg.padEnd(12)} ${r.detail}`);
const failed = results.some((r) => r.status === 'FAIL');
const flagged = results.filter((r) => r.status.startsWith('FLAGGED'));
if (flagged.length) console.log(`\n${flagged.length} leg(s) FLAGGED for missing credentials — fill .env and re-run.`);
process.exit(failed ? 1 : 0);
