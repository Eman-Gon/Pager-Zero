import type { Driver } from 'neo4j-driver';
import { log } from './log.js';
import { openSession } from './neo4j-config.js';

export interface RunbookHit {
  title: string;
  text: string;
  score: number;
  applies: boolean;
}

// One runbook per bug class; APPLIES_TO names real Function nodes in the code graph.
const RUNBOOKS: { title: string; text: string; appliesTo: string[] }[] = [
  {
    title: 'Wrong operator in arithmetic computation',
    text: 'Symptom: a pure numeric function suddenly returns values that are too large or too small, and multiple downstream totals fail together. Root cause is usually a single arithmetic operator that was swapped in a recent edit — multiplication replaced by addition, subtraction by division, or a flipped comparison. Fix approach: diff the function against its last good version, restore the intended operator, and confirm the unit test that encodes the arithmetic identity passes again. Do not compensate elsewhere; fix the operator at the source.',
    appliesTo: ['computeTax', 'lineTotal'],
  },
  {
    title: 'Off-by-one error in aggregation boundary',
    text: 'Symptom: totals over a collection are wrong by exactly one element — the first or last item is skipped or counted twice. Root cause is an incorrect loop bound, a reduce with the wrong initial value, or slicing that excludes an endpoint. Fix approach: check the iteration start/end and the accumulator seed, and add a test with a single-element and an empty collection to pin the boundary behavior.',
    appliesTo: ['invoiceTotal', 'sumRiskWeights'],
  },
  {
    title: 'Missing null or undefined handling',
    text: 'Symptom: a function throws "cannot read property of undefined" or renders "NaN"/"undefined" into output when given empty or missing input. Root cause is an unguarded dereference of an optional value or an empty collection. Fix approach: add an explicit guard or default at the entry point of the function that first receives the optional value, and return a well-defined neutral result (zero, empty string) rather than letting the bad value propagate.',
    appliesTo: ['renderInvoice'],
  },
  {
    title: 'Type mismatch in formatting or coercion',
    text: 'Symptom: rendered output shows concatenated digits, "[object Object]", or misplaced decimal points while the underlying numbers are correct. Root cause is a string/number coercion mistake in a formatting function — using + with a string operand, or calling toFixed on a non-number. Fix approach: convert explicitly at the formatting boundary (Number(...) before arithmetic, template literals for display) and assert the input type in the formatter test.',
    appliesTo: ['formatCurrency'],
  },
];

const INDEX_NAME = 'runbook_vec';

// The runbook corpus as plain docs, so the Cognee memory service can ingest the
// same source material into its knowledge graph (Integration 1). This is the
// seed corpus — extend with real postmortems later.
export function runbookDocs(): { title: string; text: string }[] {
  return RUNBOOKS.map(({ title, text }) => ({ title, text }));
}

function nebiusEnv(): { base: string; key: string; model: string } | null {
  const key = process.env.NEBIUS_API_KEY;
  const model = process.env.NEBIUS_EMBED_MODEL;
  if (!key || !model) return null;
  const base = (process.env.NEBIUS_BASE_URL ?? 'https://api.tokenfactory.nebius.com/v1').replace(/\/$/, '');
  return { base, key, model };
}

async function embed(texts: string[]): Promise<number[][]> {
  const env = nebiusEnv();
  if (!env) throw new Error('Nebius not configured');
  const res = await fetch(`${env.base}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.key}` },
    body: JSON.stringify({ model: env.model, input: texts }),
  });
  if (!res.ok) throw new Error(`Nebius embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { data: { index: number; embedding: number[] }[] };
  return body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// Idempotent: nodes + APPLIES_TO always (no creds needed); embeddings + vector
// index only when Nebius is configured and the stored model differs.
export async function ensureRunbookSubstrate(driver: Driver): Promise<void> {
  const session = openSession(driver);
  try {
    for (const rb of RUNBOOKS) {
      await session.run(`MERGE (r:Runbook {title: $title}) SET r.text = $text`, rb);
      for (const fn of rb.appliesTo) {
        await session.run(
          `MATCH (r:Runbook {title: $title}), (f:Function {name: $fn}) MERGE (r)-[:APPLIES_TO]->(f)`,
          { title: rb.title, fn },
        );
      }
    }

    const env = nebiusEnv();
    if (!env) {
      log('runbook_embeddings_flagged', { reason: 'NEBIUS_API_KEY / NEBIUS_EMBED_MODEL not set' });
      return;
    }

    const stale = await session.run(
      `MATCH (r:Runbook) WHERE r.embedding IS NULL OR r.embedding_model <> $model RETURN count(r) AS n`,
      { model: env.model },
    );
    if (stale.records[0].get('n').toNumber() === 0) return;

    const vectors = await embed(RUNBOOKS.map((r) => r.text));
    const dim = vectors[0].length;
    for (let i = 0; i < RUNBOOKS.length; i++) {
      await session.run(
        `MATCH (r:Runbook {title: $title}) SET r.embedding = $embedding, r.embedding_model = $model`,
        { title: RUNBOOKS[i].title, embedding: vectors[i], model: env.model },
      );
    }
    // Recreate the index so its dimension always matches the current model.
    await session.run(`DROP INDEX ${INDEX_NAME} IF EXISTS`);
    await session.run(
      `CREATE VECTOR INDEX ${INDEX_NAME} IF NOT EXISTS FOR (r:Runbook) ON (r.embedding)
       OPTIONS {indexConfig: {\`vector.dimensions\`: ${dim}, \`vector.similarity_function\`: 'cosine'}}`,
    );
    await session.run(`CALL db.awaitIndex('${INDEX_NAME}')`);
    log('runbook_index_ready', { model: env.model, dimension: dim, runbooks: RUNBOOKS.length });
  } finally {
    await session.close();
  }
}

// Graph-aware retrieval: vector similarity, boosted by APPLIES_TO on the
// incident's root-cause function (graph + vector, not vector alone).
export async function retrieveRunbooks(
  driver: Driver,
  incidentQuery: string,
  rootCause: string,
): Promise<RunbookHit[] | null> {
  if (!nebiusEnv()) return null;
  const [qEmb] = await embed([incidentQuery]);
  const session = openSession(driver);
  try {
    const res = await session.run(
      `CALL db.index.vector.queryNodes($index, 5, $qEmb) YIELD node, score
       OPTIONAL MATCH (node)-[:APPLIES_TO]->(f:Function {name: $root})
       RETURN node.title AS title, node.text AS text, score, f IS NOT NULL AS applies
       ORDER BY applies DESC, score DESC
       LIMIT 3`,
      { index: INDEX_NAME, qEmb, root: rootCause },
    );
    return res.records.map((r) => ({
      title: r.get('title'),
      text: r.get('text'),
      score: r.get('score'),
      applies: r.get('applies'),
    }));
  } finally {
    await session.close();
  }
}
