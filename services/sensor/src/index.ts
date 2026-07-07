import Fastify from 'fastify';
import type { Driver } from 'neo4j-driver';
import { analyzeTarget, writeCodeGraph } from './codegraph.js';
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

const graph = analyzeTarget(TARGET_DIR);
await writeCodeGraph(driver, graph);
log('graph_built', {
  functions: graph.functions.map((f) => f.name),
  calls: graph.calls.length,
  tests: graph.tests.length,
  tests_edges: graph.testsEdges.length,
});

const app = Fastify();
registerCors(app);

// Scan-loop state surfaced on /incident so "ok" can't mean "never scanned".
let lastHead: string | null = null;
let lastScanAt: string | null = null;
let lastScanError: string | null = null;

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
        root_cause: null,
        blast_radius: [],
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
      root_cause: rootCause,
      blast_radius: blastRadius,
      scanned_head: lastHead,
      last_scan_at: lastScanAt,
      last_scan_error: lastScanError,
    };
  } finally {
    await session.close();
  }
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
