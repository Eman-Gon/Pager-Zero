import Fastify from 'fastify';
import neo4j, { type Driver } from 'neo4j-driver';
import { assembleContext, functionFile, type Incident } from './context.js';
import { log } from './log.js';
import { DiagnosisPipeline } from './pipeline.js';
import { ensureRunbookSubstrate, retrieveRunbooks } from './runbooks.js';

const NEO4J_URL = process.env.NEO4J_URL ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'devpassword';
const SENSOR_URL = process.env.SENSOR_URL ?? 'http://localhost:3003';
const TARGET_DIR = process.env.TARGET_DIR ?? '/target';
const PORT = Number(process.env.PORT ?? 3004);

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
const pipeline = new DiagnosisPipeline();

// Best-effort at startup; repeated per /diagnose because the sensor may not
// have written the Function nodes yet when the responder first boots.
await ensureRunbookSubstrate(driver).catch((err) => log('runbook_seed_error', { error: String(err) }));

const app = Fastify();

app.get('/connection', async () => {
  // Proof the pipeline runs on RocketRide Cloud: connect (if not yet) and
  // return the live connection info — uri must be the cloud host.
  try {
    await pipeline.ensureConnected();
  } catch (err) {
    return { ...pipeline.connectionInfo(), error: String(err) };
  }
  return pipeline.connectionInfo();
});

app.post('/diagnose', async (request, reply) => {
  const res = await fetch(`${SENSOR_URL}/incident`);
  if (!res.ok) {
    reply.code(502);
    return { error: `sensor /incident returned ${res.status}` };
  }
  const incident = (await res.json()) as Incident;
  if (incident.status === 'ok') return { status: 'ok' };

  log('diagnose_start', { root_cause: incident.root_cause, failing_tests: incident.failing_tests });

  let runbooks = null;
  if (incident.root_cause) {
    await ensureRunbookSubstrate(driver);
    const file = await functionFile(driver, incident.root_cause);
    const query = `Function ${incident.root_cause} (${file ?? 'unknown file'}) was changed in a recent commit and these tests now fail: ${incident.failing_tests.join(', ')}. Downstream affected: ${incident.blast_radius.join(', ')}.`;
    runbooks = await retrieveRunbooks(driver, query, incident.root_cause);
    if (runbooks) log('runbooks_retrieved', { hits: runbooks.map((r) => ({ title: r.title, applies: r.applies, score: r.score })) });
    else log('runbooks_flagged', { reason: 'Nebius not configured — diagnosing without runbooks' });
  }

  const context = await assembleContext(driver, TARGET_DIR, incident, runbooks);
  log('context_assembled', { chars: context.length });
  const diagnosis = await pipeline.diagnose(context);
  log('diagnose_done', { severity: diagnosis.severity, cited_runbook: diagnosis.cited_runbook });

  return { status: 'incident', incident, diagnosis };
});

app.setErrorHandler((error, _request, reply) => {
  log('request_error', { error: String(error) });
  reply.code(500).send({ error: String(error) });
});

await app.listen({ port: PORT, host: '0.0.0.0' });
log('listening', { port: PORT });
