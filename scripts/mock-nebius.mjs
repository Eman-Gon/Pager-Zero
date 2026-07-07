// Dev-only mock of an OpenAI-compatible /v1/embeddings endpoint, used to
// verify the runbook vector-index + retrieval plumbing before real Nebius
// credentials exist. Deterministic bag-of-words hash vectors (64 dims):
// texts sharing words get similar vectors — crude but order-stable.
//
//   node scripts/mock-nebius.mjs   # listens on :3999
//   NEBIUS_BASE_URL=http://host.docker.internal:3999/v1 \
//   NEBIUS_API_KEY=mock NEBIUS_EMBED_MODEL=mock-64 docker compose up -d responder

import { createServer } from 'node:http';

const DIM = 64;

function embed(text) {
  const v = new Array(DIM).fill(0);
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    let h = 0;
    for (const c of word) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % DIM] += 1;
  }
  const norm = Math.hypot(...v) || 1;
  return v.map((x) => x / norm);
}

createServer((req, res) => {
  if (req.method !== 'POST' || !req.url?.endsWith('/embeddings')) {
    res.writeHead(404).end();
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const { input, model } = JSON.parse(body);
    const texts = Array.isArray(input) ? input : [input];
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        object: 'list',
        model,
        data: texts.map((t, index) => ({ object: 'embedding', index, embedding: embed(t) })),
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
    );
  });
}).listen(3999, () => console.log('mock nebius embeddings on :3999'));
