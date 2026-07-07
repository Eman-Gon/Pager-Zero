import Fastify from 'fastify';
import neo4j, { type Driver } from 'neo4j-driver';
import { analyzeTarget, writeCodeGraph } from './codegraph.js';
import { log } from './log.js';
import { ensureTargetDeps, gitHead, scan } from './scan.js';

const NEO4J_URL = process.env.NEO4J_URL ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'devpassword';
const TARGET_DIR = process.env.TARGET_DIR ?? '/target';
const PORT = Number(process.env.PORT ?? 3003);

async function connectWithRetry(): Promise<Driver> {
  const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
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

app.get('/incident', async () => {
  const session = driver.session();
  try {
    const failingTests = (
      await session.run(`MATCH (t:Test {status:'failing'}) RETURN t.file AS file ORDER BY file`)
    ).records.map((r) => r.get('file'));
    const changedFunctions = (
      await session.run(`MATCH (f:Function {changed:true}) RETURN f.name AS name ORDER BY name`)
    ).records.map((r) => r.get('name'));

    if (failingTests.length === 0) {
      return {
        status: 'ok',
        failing_tests: [],
        changed_functions: changedFunctions,
        root_cause: null,
        blast_radius: [],
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
    };
  } finally {
    await session.close();
  }
});

await app.listen({ port: PORT, host: '0.0.0.0' });
log('listening', { port: PORT });

await ensureTargetDeps(TARGET_DIR);

let lastHead: string | null = null;
for (;;) {
  try {
    const head = await gitHead(TARGET_DIR);
    if (head !== lastHead) {
      log('scan_start', { head });
      await scan(driver, TARGET_DIR);
      lastHead = head;
      log('scan_done', { head });
    }
  } catch (err) {
    log('scan_error', { error: String(err) });
  }
  await new Promise((r) => setTimeout(r, 2000));
}
