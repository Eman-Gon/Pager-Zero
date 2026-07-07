import Fastify from 'fastify';
import type { Driver } from 'neo4j-driver';
import { assembleContext, functionFile, type Incident } from './context.js';
import { log } from './log.js';
import { createDriver } from './neo4j-config.js';
import { DiagnosisPipeline, type CandidateFix, type Diagnosis, rocketrideConfigured } from './pipeline.js';
import { ensureRunbookSubstrate, retrieveRunbooks, runbookDocs } from './runbooks.js';
import {
  ingestKnowledge,
  knowledgeEnabled,
  memoryEnabled,
  recallEpisodes,
  rememberIncident,
  retrieveKnowledge,
} from './knowledge.js';
import { verifyCandidate, verifyCandidatesParallel } from './verify.js';
import {
  PaywallError,
  actionWithIncident,
  bearerToken,
  butterbaseConfigured,
  createApproval,
  ensureAccount,
  findPendingApproval,
  getApproval,
  latestDiagnoseCandidate,
  latestVerifiedAction,
  markApplied,
  recordIncidentAction,
  refundCredit,
  setApprovalStatus,
  spendCredit,
  type ActionRow,
  type StoredIncidentRow,
} from './butterbase.js';
import { evaluatePolicy } from './policy.js';
import { githubConfigured, openFixPr } from './ship.js';
import {
  OpseraGateError,
  evaluateOpseraGate,
  opseraConfigured,
  recordOpseraDeployment,
} from './opsera.js';
import { startAutonomousLoop } from './autonomous.js';

const SENSOR_URL = process.env.SENSOR_URL ?? 'http://localhost:3003';
const TARGET_DIR = process.env.TARGET_DIR ?? '/target';
const PORT = Number(process.env.PORT ?? 3004);

// Thrown when a ship is attempted for an action that was already applied — the
// idempotency backstop against double-shipping one fix (two PRs / two credits).
class AlreadyAppliedError extends Error {
  constructor() {
    super('this fix has already been applied');
  }
}

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
const pipeline = new DiagnosisPipeline();

// Best-effort at startup; repeated per /diagnose because the sensor may not
// have written the Function nodes yet when the responder first boots.
await ensureRunbookSubstrate(driver).catch((err) => log('runbook_seed_error', { error: String(err) }));

// Integration 1: when Cognee is enabled, ingest the runbook corpus into the
// knowledge graph in the background (cognify is slow — never block startup).
if (knowledgeEnabled()) {
  void ingestKnowledge(runbookDocs()).catch((err) => log('knowledge_ingest_error', { error: String(err) }));
}

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

app.get('/health', async () => {
  let sensor = false;
  try {
    sensor = (await fetch(`${SENSOR_URL}/incident`)).ok;
  } catch {
    /* sensor unreachable */
  }
  let neo4j = false;
  try {
    await driver.verifyConnectivity();
    neo4j = true;
  } catch {
    /* neo4j unreachable */
  }
  return {
    sensor,
    neo4j,
    rocketride: pipeline.connectionInfo(),
    butterbase: butterbaseConfigured(),
    tools: {
      daytona: Boolean(process.env.DAYTONA_API_KEY),
      github: githubConfigured(),
      nebius: Boolean(process.env.NEBIUS_API_KEY && process.env.NEBIUS_EMBED_MODEL),
      rocketride: rocketrideConfigured(),
      opsera: opseraConfigured(),
    },
  };
});

// Sync account row (subscription + demo credits) for the signed-in user.
app.get('/account', async (request, reply) => {
  const token = requireToken(request, reply);
  if (!token) return { error: 'sign in first — Bearer token required' };
  const account = await ensureAccount(token);
  return account;
});

// M5 Phase 2: the guarded stub that proves the credit/paywall flow end-to-end.
// Spends one credit (or returns the paywall) without any of the M6 ship side
// effects — the real apply lives in POST /apply.
app.post('/apply-stub', async (request, reply) => {
  const token = requireToken(request, reply);
  if (!token) return { error: 'sign in first — Bearer token required' };
  try {
    const { remaining } = await spendCredit(token);
    return { status: 'ok', apply_credits: remaining };
  } catch (err) {
    if (err instanceof PaywallError) {
      reply.code(402);
      return { error: 'payment_required', message: err.message };
    }
    throw err;
  }
});

// The M3 flow: incident from the sensor → runbook retrieval → context →
// Cloud pipeline. Shared by /diagnose (M3) and /remediate (M4).
async function runDiagnosis(candidates = 1): Promise<
  { status: 'ok' } | { status: 'incident'; incident: Incident; diagnosis: Diagnosis; pipeline?: string }
> {
  const res = await fetch(`${SENSOR_URL}/incident`);
  if (!res.ok) throw new Error(`sensor /incident returned ${res.status}`);
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

  let context = await assembleContext(driver, TARGET_DIR, incident, runbooks);

  // Integration 1 & 3: enrich the prompt with Cognee knowledge-graph hits and
  // recalled prior incidents. Both are best-effort and additive — the existing
  // graph-boosted runbook context above is untouched when Cognee is off/down.
  const query = incident.root_cause
    ? `Incident on ${incident.root_cause}. Failing tests: ${incident.failing_tests.join(', ')}. Affected: ${incident.blast_radius.join(', ')}.`
    : `Failing tests: ${incident.failing_tests.join(', ')}.`;
  if (knowledgeEnabled()) {
    const hits = await retrieveKnowledge(query);
    if (hits?.length) context += `\n## Knowledge graph (Cognee)\n${hits.map((h) => `- ${h}`).join('\n')}`;
  }
  if (memoryEnabled()) {
    const priors = await recallEpisodes(query);
    if (priors?.length) {
      context += `\n## Prior incidents (agent memory)\nWe have handled similar incidents before — prefer a fix consistent with what worked:\n${priors.map((p) => `- ${p}`).join('\n')}`;
    }
  }

  if (candidates > 1) {
    context += `\n## Candidates requested\nReturn ${candidates} candidate variants in candidate_fixes.`;
  }
  log('context_assembled', { chars: context.length });
  const diagnosis = await pipeline.diagnose(context);
  const pipelineKind = pipeline.connectionInfo().pipeline;
  log('diagnose_done', { severity: diagnosis.severity, cited_runbook: diagnosis.cited_runbook, pipeline: pipelineKind });

  return { status: 'incident', incident, diagnosis, pipeline: pipelineKind };
}

// M5: Butterbase persistence is keyed to the signed-in user's JWT. When the
// app is configured a token is required; without config (pre-M5 dev) the
// engine still runs, it just doesn't persist.
function requireToken(request: { headers: Record<string, unknown> }, reply: { code: (n: number) => unknown }): string | null {
  const token = bearerToken(request.headers.authorization as string | undefined);
  if (butterbaseConfigured() && !token) {
    reply.code(401);
    return null;
  }
  return token;
}

app.post('/diagnose', async (request, reply) => {
  const token = requireToken(request, reply);
  if (butterbaseConfigured() && !token) return { error: 'sign in first — Bearer token required' };

  const out = await runDiagnosis();
  if (out.status === 'incident' && token) {
    const rows = await recordIncidentAction(token, out.incident, out.diagnosis, { type: 'diagnose' });
    return { ...out, ...rows };
  }
  return out;
});

// The M6 ship path: spend a credit → real GitHub PR → resolve + MTTR.
// Paywall first: no credits → no PR. Shared by /apply (auto path) and
// /approvals/:id (approved path).
async function shipVerifiedFix(
  token: string,
  pending: { action: ActionRow; incident: StoredIncidentRow },
): Promise<{ pr_url: string; branch: string; mttr_seconds: number; opsera_gate?: boolean }> {
  // Idempotency guard: never ship the same action twice. Two approvals for one
  // action (or a re-approved record) would otherwise open two PRs and spend two
  // credits. latestVerifiedAction already filters applied rows for /apply; this
  // covers the /approvals path where the action is loaded by id.
  if (pending.action.applied) {
    throw new AlreadyAppliedError();
  }

  // M6 Phase 2: Opsera policy-as-code gate runs BEFORE any credit is spent or
  // PR opened. A policy-violating fix is blocked at the gate (no side effects).
  const opseraGate = evaluateOpseraGate({
    action_type: pending.action.type,
    fix_path: pending.action.candidate_fix!.path,
  });
  if (!opseraGate.allowed) {
    log('opsera_gate_blocked', { reasons: opseraGate.reasons });
    throw new OpseraGateError('blocked by Opsera policy gate', opseraGate.reasons);
  }

  await spendCredit(token);

  const res = await fetch(`${SENSOR_URL}/incident`);
  const live = res.ok ? ((await res.json()) as Incident) : null;
  let pr_url: string;
  let branch: string;
  try {
    ({ pr_url, branch } = await openFixPr(pending.action.candidate_fix!, {
      root_cause: pending.incident.root_cause,
      failing_tests: live?.status === 'incident' ? live.failing_tests : [],
    }));
  } catch (err) {
    // The PR is the irreversible act; the credit was spent a step earlier. If
    // the PR fails, give the credit back so a GitHub outage doesn't burn it.
    await refundCredit(token).catch((e) => log('credit_refund_error', { error: String(e) }));
    throw err;
  }

  const { mttr_seconds } = await markApplied(token, pending.action, pending.incident);

  // Record the deployment + DORA Time-to-Restore in Opsera (best-effort).
  void recordOpseraDeployment({
    root_cause: pending.incident.root_cause,
    fix_path: pending.action.candidate_fix!.path,
    pr_url,
    branch,
    mttr_seconds,
    severity: pending.incident.severity,
  });

  // Integration 3: remember this shipped fix as long-term agent memory (persisted
  // in Neo4j via Cognee) so future diagnoses — and restarted / sandboxed agents —
  // recall what worked. Fire-and-forget; no-ops when memory is disabled.
  void rememberIncident({
    root_cause: pending.incident.root_cause,
    failing_tests: live?.status === 'incident' ? live.failing_tests : [],
    fix_path: pending.action.candidate_fix?.path,
    fix_summary: pending.incident.severity ? `severity ${pending.incident.severity}` : undefined,
    verified: true,
    pr_url,
  }).catch((err) => log('remember_failed', { error: String(err) }));

  return { pr_url, branch, mttr_seconds };
}

// M6 + M7: ship the verified fix, gated by the deterministic policy. Risky
// fixes park as a pending approval — no PR, no credit spent — until a human
// decides via POST /approvals/:id.
app.post('/apply', async (request, reply) => {
  const token = requireToken(request, reply);
  if (!token) return { error: 'sign in first — Bearer token required' };

  const pending = await latestVerifiedAction(token);
  if (!pending) {
    reply.code(409);
    return { error: 'no verified, unapplied fix for an open incident — run /remediate first' };
  }

  const decision = evaluatePolicy({
    severity: pending.incident.severity,
    blast_radius: pending.incident.blast_radius?.functions ?? [],
    fix_path: pending.action.candidate_fix!.path,
  });
  if (decision.requires_approval) {
    // Reuse an open approval for this action if one exists, so repeated /apply
    // calls don't pile up duplicate pending approvals for the same fix.
    const approval =
      (await findPendingApproval(token, pending.action.id)) ??
      (await createApproval(token, pending.action.id));
    log('apply_gated', { approval_id: approval.id, reasons: decision.reasons });
    return { status: 'pending_approval', approval_id: approval.id, reasons: decision.reasons };
  }

  try {
    return await shipVerifiedFix(token, pending);
  } catch (err) {
    if (err instanceof PaywallError) {
      reply.code(402);
      return { error: 'payment_required', message: err.message };
    }
    if (err instanceof AlreadyAppliedError) {
      reply.code(409);
      return { error: 'already_applied', message: err.message };
    }
    if (err instanceof OpseraGateError) {
      reply.code(422);
      return { error: 'opsera_gate_blocked', reasons: err.reasons };
    }
    throw err;
  }
});

// M7 Phase 2: decide a pending approval. approved → run the M6 ship;
// denied → abort with no side effects (no PR, no credit).
app.post('/approvals/:id', async (request, reply) => {
  const token = requireToken(request, reply);
  if (!token) return { error: 'sign in first — Bearer token required' };

  const { id } = request.params as { id: string };
  const { decision } = (request.body ?? {}) as { decision?: string };
  if (decision !== 'approved' && decision !== 'denied') {
    reply.code(400);
    return { error: 'body must be { "decision": "approved" | "denied" }' };
  }

  const approval = await getApproval(token, id);
  if (!approval) {
    reply.code(404);
    return { error: 'approval not found' };
  }
  if (approval.status !== 'pending') {
    reply.code(409);
    return { error: `approval already ${approval.status}` };
  }

  if (decision === 'denied') {
    await setApprovalStatus(token, id, 'denied');
    return { status: 'denied' };
  }

  const pending = await actionWithIncident(token, approval.action_id);
  if (!pending?.action.candidate_fix?.path) {
    reply.code(409);
    return { error: 'approved action has no candidate_fix' };
  }
  // Already shipped (e.g. a duplicate approval got approved first): don't ship
  // again. Settle this approval as approved without a second PR or credit spend.
  if (pending.action.applied) {
    await setApprovalStatus(token, id, 'approved');
    reply.code(409);
    return { status: 'approved', error: 'already_applied', message: 'this fix was already shipped' };
  }
  try {
    const shipped = await shipVerifiedFix(token, pending);
    await setApprovalStatus(token, id, 'approved');
    return { status: 'approved', ...shipped };
  } catch (err) {
    if (err instanceof PaywallError) {
      reply.code(402);
      return { error: 'payment_required', message: err.message };
    }
    if (err instanceof AlreadyAppliedError) {
      await setApprovalStatus(token, id, 'approved');
      reply.code(409);
      return { status: 'approved', error: 'already_applied', message: err.message };
    }
    if (err instanceof OpseraGateError) {
      reply.code(422);
      return { error: 'opsera_gate_blocked', reasons: err.reasons };
    }
    throw err;
  }
});

// M4: diagnosis + candidate fix, proven against the real test suite in a
// Daytona sandbox.
//   default            → single pipeline candidate, fresh sandbox   (Phase 1)
//   {candidate_fix}    → caller-supplied candidate, same loop — the reject check
//   {candidates: N}    → pipeline generates N variants, verified in parallel
//                        from the pre-installed snapshot            (Phase 2)
//   {candidate_fixes}  → caller-supplied variants through the parallel loop
app.post('/remediate', async (request, reply) => {
  const token = requireToken(request, reply);
  if (butterbaseConfigured() && !token) return { error: 'sign in first — Bearer token required' };

  const body = (request.body ?? null) as {
    candidate_fix?: CandidateFix;
    candidate_fixes?: CandidateFix[];
    candidates?: number;
  } | null;

  const isFix = (f: CandidateFix | undefined): f is CandidateFix =>
    Boolean(f?.path) && typeof f?.content === 'string';

  let diagnosis: Diagnosis | undefined;
  let candidates: CandidateFix[];

  if (body?.candidate_fixes?.length && body.candidate_fixes.every(isFix)) {
    candidates = body.candidate_fixes;
    log('remediate_override', { paths: candidates.map((c) => c.path) });
  } else if (isFix(body?.candidate_fix)) {
    candidates = [body!.candidate_fix!];
    log('remediate_override', { path: candidates[0].path });
  } else {
    const cached = token ? await latestDiagnoseCandidate(token).catch((err) => {
      log('remediate_cache_error', { error: String(err) });
      return null;
    }) : null;
    if (cached) {
      candidates = [cached.candidate];
      diagnosis = cached.diagnosis;
      log('remediate_cached_candidate', { path: cached.candidate.path });
    } else {
      log('remediate_cache_miss', { hint: 'no persisted diagnose candidate — will call RocketRide' });
      // Candidate cap is configurable (default generous); each candidate is an
      // LLM call + sandbox verify, so keep a sane upper bound rather than truly ∞.
      const MAX_CANDIDATES = Math.max(Number(process.env.MAX_CANDIDATES ?? 25), 1);
      const n = Math.min(Math.max(Number(body?.candidates) || 1, 1), MAX_CANDIDATES);
      const out = await runDiagnosis(n);
      if (out.status === 'ok') return { status: 'ok' };
      diagnosis = out.diagnosis;
      candidates = (n > 1 && diagnosis.candidate_fixes?.every(isFix) ? diagnosis.candidate_fixes : [diagnosis.candidate_fix])
        .filter(isFix);
      if (!candidates.length) {
        reply.code(502);
        return { error: 'pipeline returned no candidate_fix' };
      }
    }
  }

  // Persist the remediation attempt for the signed-in user (M5).
  async function persistRemediate(
    verified: boolean,
    fix: CandidateFix | null,
    test_output?: string,
    results?: { candidate_index: number; verified: boolean }[],
  ) {
    if (!token) return {};
    const res = await fetch(`${SENSOR_URL}/incident`);
    if (!res.ok) return {};
    const incident = (await res.json()) as Incident;
    if (incident.status === 'ok') return {};
    return recordIncidentAction(
      token,
      incident,
      diagnosis ?? { severity: 'high', root_cause_explanation: '', proposed_fix_approach: '', cited_runbook: null },
      { type: 'remediate', candidate_fix: fix, verified, test_output, results },
    ).catch((err) => {
      log('butterbase_persist_failed', { error: String(err) });
      return {};
    });
  }

  log('remediate_verify_start', { count: candidates.length });
  if (candidates.length === 1) {
    const { verified, test_output } = await verifyCandidate(TARGET_DIR, candidates[0]);
    log('remediate_done', { verified });
    const rows = await persistRemediate(verified, candidates[0], test_output);
    return { verified, candidate_fix: candidates[0], test_output, ...(diagnosis ? { diagnosis } : {}), ...rows };
  }

  const { selected, results } = await verifyCandidatesParallel(TARGET_DIR, candidates);
  log('remediate_done', { verified: selected !== null, selected });
  const rows = await persistRemediate(
    selected !== null,
    selected !== null ? candidates[selected] : null,
    selected !== null ? results[selected].test_output : results.map((r) => r.test_output).join('\n---\n'),
    results.map(({ candidate_index, verified }) => ({ candidate_index, verified })),
  );
  return {
    verified: selected !== null,
    candidate_fix: selected !== null ? candidates[selected] : null,
    test_output: selected !== null ? results[selected].test_output : results.map((r) => r.test_output).join('\n---\n'),
    selected,
    results: results.map(({ candidate_index, verified }) => ({ candidate_index, verified })),
    ...(diagnosis ? { diagnosis } : {}),
    ...rows,
  };
});

app.setErrorHandler((error, _request, reply) => {
  log('request_error', { error: String(error) });
  reply.code(500).send({ error: String(error) });
});

await app.listen({ port: PORT, host: '0.0.0.0' });
log('listening', { port: PORT });

// Opt-in autonomous mode (AUTONOMOUS=1): watch the sensor and drive
// diagnose → remediate → apply for new incidents with no human in the loop.
startAutonomousLoop({ sensorUrl: SENSOR_URL, selfUrl: `http://localhost:${PORT}` });

// Fire-and-forget: pre-load the Cloud pipeline so the first /diagnose is warm —
// a cold load (restart + LLM service boot) can take minutes.
pipeline.warmup().catch((err) => log('pipeline_warmup_flagged', { error: String(err) }));
