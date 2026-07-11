import Fastify from 'fastify';
import type { Driver } from 'neo4j-driver';
import { analyzeTarget, clearCodeGraph, writeCodeGraph } from './codegraph.js';
import { log } from './log.js';
import { createDriver, openSession } from './neo4j-config.js';
import { ensureTargetDeps, gitHead, scan } from './scan.js';
import { registerCors } from './cors.js';

const TARGET_DIR = process.env.TARGET_DIR ?? '/target';
const PORT = Number(process.env.PORT ?? 3003);

async function connectWithRetry(): Promise<Driver> {
  const driver = createDriver();
  for (let attempt = 1; ; attempt++) {
    try {
      await driver.verifyConnectivity();
      log('neo4j_connected', { attempt });
      return driver;
    } catch (err) {
      if (attempt >= 30) throw err;
      log('neo4j_retry', { attempt });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

const driver = await connectWithRetry();

// Build the code graph from the current target repo. Clearing first makes this
// safe to call again at runtime (via POST /graph/reload) after a new patient
// repo is loaded, so the graph reflects the new source without a restart.
async function buildGraph(): Promise<void> {
  await clearCodeGraph(driver);
  const graph = analyzeTarget(TARGET_DIR);
  await writeCodeGraph(driver, graph);
  log('graph_built', {
    functions: graph.functions.map((f) => f.name),
    calls: graph.calls.length,
    tests: graph.tests.length,
    tests_edges: graph.testsEdges.length,
  });
}

await buildGraph();

const app = Fastify();
registerCors(app);

// Scan-loop state surfaced on /incident so "ok" can't mean "never scanned".
let lastHead: string | null = null;
let lastScanAt: string | null = null;
let lastScanError: string | null = null;

// Rebuild the code graph after a new patient repo has been loaded into the
// target dir. Resetting scan state forces the loop to re-scan on its next tick.
app.post('/graph/reload', async () => {
  await buildGraph();
  lastHead = null;
  lastScanAt = null;
  lastScanError = null;
  log('graph_reloaded', {});
  return { status: 'reloaded' };
});

function countValue(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toNumber?: () => number }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value ?? 0);
}

app.get('/graph/summary', async () => {
  const session = openSession(driver);
  try {
    const nodeCounts = await session.run(`
      MATCH (n)
      UNWIND labels(n) AS label
      RETURN label, count(*) AS count
      ORDER BY label
    `);
    const relationshipCounts = await session.run(`
      MATCH ()-[r]->()
      RETURN type(r) AS type, count(r) AS count
      ORDER BY type
    `);
    const functionStatuses = await session.run(`
      MATCH (f:Function)
      RETURN coalesce(f.status, 'unknown') AS status, count(*) AS count
      ORDER BY status
    `);
    const changed = await session.run(`
      MATCH (f:Function {changed: true})
      RETURN count(f) AS count
    `);

    return {
      nodes: Object.fromEntries(nodeCounts.records.map((r) => [r.get('label'), countValue(r.get('count'))])),
      relationships: Object.fromEntries(relationshipCounts.records.map((r) => [r.get('type'), countValue(r.get('count'))])),
      functions_by_status: Object.fromEntries(functionStatuses.records.map((r) => [r.get('status'), countValue(r.get('count'))])),
      changed_functions: countValue(changed.records[0]?.get('count')),
      scanned_head: lastHead,
      last_scan_at: lastScanAt,
      last_scan_error: lastScanError,
    };
  } finally {
    await session.close();
  }
});

app.get('/incident', async () => {
  const session = openSession(driver);
  try {
    const failingTests = (
      await session.run(`MATCH (t:Test {status:'failing'}) RETURN t.file AS file ORDER BY file`)
    ).records.map((r) => r.get('file'));
    const changedFunctions = (
      await session.run(`MATCH (f:Function {changed:true}) RETURN f.name AS name ORDER BY name`)
    ).records.map((r) => r.get('name'));

    // Scan freshness: "ok" is only trustworthy after a scan has completed, and
    // a repeatedly failing scan loop must be visible, not silently stale.
    const scanMeta = {
      scanned_head: lastHead,
      last_scan_at: lastScanAt,
      last_scan_error: lastScanError,
    };

    if (failingTests.length === 0) {
      return {
        status: lastHead ? 'ok' : 'unscanned',
        failing_tests: [],
        changed_functions: changedFunctions,
        changed_function_count: changedFunctions.length,
        root_cause: null,
        blast_radius: [],
        blast_radius_count: 0,
        ...scanMeta,
      };
    }

    const rootResult = await session.run(
      `MATCH (f:Function {changed:true, status:'failing'})
       WHERE NOT EXISTS { MATCH (f)-[:CALLS]->(:Function {changed:true}) }
       RETURN f.name AS root_cause`,
    );
    const rootCause: string | null = rootResult.records[0]?.get('root_cause') ?? null;

    const blastRadius = rootCause
      ? (
          await session.run(
            `MATCH (caller:Function)-[:CALLS*]->(root:Function {name:$root})
             RETURN DISTINCT caller.name AS affected`,
            { root: rootCause },
          )
        ).records.map((r) => r.get('affected'))
      : [];

    return {
      status: 'incident',
      failing_tests: failingTests,
      changed_functions: changedFunctions,
      changed_function_count: changedFunctions.length,
      root_cause: rootCause,
      blast_radius: blastRadius,
      blast_radius_count: blastRadius.length,
      scanned_head: lastHead,
      last_scan_at: lastScanAt,
      last_scan_error: lastScanError,
    };
  } finally {
    await session.close();
  }
});

// Demo controls: inject the patient's known incident / restore the good tag,
// so the whole break→detect→ship arc can be driven from the UI. Each patient
// carries one scripted incident, keyed by which source file it has.
const DEMO_BREAKS = [
  {
    file: 'src/riskScore.ts',
    from: 'for (let i = 0; i < codes.length; i++) {',
    to: 'for (let i = 0; i <= codes.length; i++) {',
    message: 'incident: off-by-one loop boundary in sumRiskWeights inflates every risk score by 1',
  },
  {
    file: 'src/tax.ts',
    from: 'return amount * rate;',
    to: 'return amount + rate;',
    message: 'incident: bad tax calc',
  },
  {
    file: 'src/invoice.ts',
    from: 'return amount * rate;',
    to: 'return amount + rate;',
    message: 'incident: wrong operator in computeTax adds rate instead of multiplying, wrecking every invoice total',
  },
  {
    file: 'src/pricing.ts',
    from: 'return price * (1 - pct / 100);',
    to: 'return price * (1 - pct);',
    message: 'incident: applyDiscount treats a 20% discount as a fraction, driving cart totals negative',
  },
  {
    file: 'src/coverage.ts',
    from: 'return age >= 18;',
    to: 'return age > 18;',
    message: 'incident: off-by-one age boundary in meetsAgeRequirement rejects eligible 18-year-olds',
  },
  {
    file: 'src/normalize.ts',
    from: 'return email.trim().toLowerCase();',
    to: 'return email.trim();',
    message: 'incident: normalizeEmail drops case-folding, so account lookup becomes case-sensitive',
  },
  {
    file: 'src/threshold.ts',
    from: 'return Number.isFinite(Number(raw)) ? Number(raw) : 50;',
    to: 'return Number(raw);',
    message: 'incident: parseThreshold lost its NaN guard, so risky claims never get flagged for review',
  },
];

app.post('/demo/break', async (_req, reply) => {
  const { readFile: rf, writeFile: wf } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  for (const b of DEMO_BREAKS) {
    const abs = join(TARGET_DIR, b.file);
    let src: string;
    try {
      src = await rf(abs, 'utf8');
    } catch {
      continue; // not this patient
    }
    if (!src.includes(b.from)) {
      // file exists but already broken (or diverged) — treat as already armed
      log('demo_break_noop', { file: b.file });
      return { status: 'already_broken', file: b.file };
    }
    await wf(abs, src.replace(b.from, b.to), 'utf8');
    await run('git', ['-C', TARGET_DIR, 'commit', '-am', b.message]);
    log('demo_break', { file: b.file });
    return { status: 'broken', file: b.file };
  }
  return reply.code(422).send({ error: 'no scripted incident matches this patient' });
});

app.post('/demo/reset', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  await run('git', ['-C', TARGET_DIR, 'reset', '--hard', 'good']);
  log('demo_reset', {});
  return { status: 'reset' };
});

await app.listen({ port: PORT, host: '0.0.0.0' });
log('listening', { port: PORT });

await ensureTargetDeps(TARGET_DIR);

for (;;) {
  try {
    const head = await gitHead(TARGET_DIR);
    if (head !== lastHead) {
      log('scan_start', { head });
      await scan(driver, TARGET_DIR);
      lastHead = head;
      lastScanAt = new Date().toISOString();
      lastScanError = null;
      log('scan_done', { head });
    }
  } catch (err) {
    lastScanError = String(err);
    log('scan_error', { error: lastScanError });
  }
  await new Promise((r) => setTimeout(r, 2000));
}
