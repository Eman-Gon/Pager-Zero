import { log } from './log.js';

// Client for the optional Cognee memory service (services/memory). Everything
// here is best-effort: if MEMORY_URL is unset or the service is unreachable/slow,
// every function no-ops (returns null / resolves) so the diagnosis flow falls
// straight back to the built-in runbook substrate (runbooks.ts). Nothing here is
// on the critical path.

const MEMORY_URL = process.env.MEMORY_URL?.replace(/\/$/, '');
const RECALL_TIMEOUT_MS = Number(process.env.MEMORY_TIMEOUT_MS ?? 8000);

/** Integration 1: Cognee knowledge-graph recall (replaces hard-coded runbooks). */
export function knowledgeEnabled(): boolean {
  return Boolean(MEMORY_URL) && process.env.COGNEE_ENABLED === '1';
}

/** Integration 3: persistent episodic memory across restarts / Daytona sandboxes. */
export function memoryEnabled(): boolean {
  return Boolean(MEMORY_URL) && process.env.COGNEE_MEMORY_ENABLED === '1';
}

async function call<T>(path: string, body: unknown, timeoutMs = RECALL_TIMEOUT_MS): Promise<T | null> {
  if (!MEMORY_URL) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${MEMORY_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      log('memory_call_failed', { path, status: res.status });
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    log('memory_unreachable', { path, error: String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface KnowledgeDoc {
  title: string;
  text: string;
}

/** Push runbook / postmortem docs into Cognee -> Neo4j knowledge graph. */
export async function ingestKnowledge(documents: KnowledgeDoc[]): Promise<void> {
  if (!knowledgeEnabled() || documents.length === 0) return;
  // Cognify is heavy (LLM entity extraction); give it a longer budget than recall.
  const out = await call<{ ok: boolean; ingested: number }>('/ingest', { documents }, 120_000);
  if (out?.ok) log('knowledge_ingested', { docs: out.ingested });
}

/** GraphRAG recall over the Cognee knowledge graph for a diagnosis query. */
export async function retrieveKnowledge(query: string, topK = 3): Promise<string[] | null> {
  if (!knowledgeEnabled()) return null;
  const out = await call<{ ok: boolean; hits: string[] }>('/recall', { query, top_k: topK });
  if (!out?.ok || !out.hits?.length) return null;
  log('knowledge_retrieved', { hits: out.hits.length });
  return out.hits;
}

export interface IncidentEpisode {
  root_cause: string | null;
  failing_tests: string[];
  fix_path?: string;
  fix_summary?: string;
  verified?: boolean;
  pr_url?: string;
}

/** Persist one incident+fix episode as long-term memory (Integration 3). */
export async function rememberIncident(episode: IncidentEpisode): Promise<void> {
  if (!memoryEnabled()) return;
  const out = await call<{ ok: boolean }>('/remember', episode, 120_000);
  if (out?.ok) log('incident_remembered', { root_cause: episode.root_cause });
}

/** Recall similar prior incidents to inform a fresh diagnosis (Integration 3). */
export async function recallEpisodes(query: string, topK = 3): Promise<string[] | null> {
  if (!memoryEnabled()) return null;
  const out = await call<{ ok: boolean; hits: string[] }>(
    '/recall',
    { query, top_k: topK, dataset: process.env.COGNEE_EPISODE_DATASET ?? 'rescueops_incidents' },
  );
  if (!out?.ok || !out.hits?.length) return null;
  log('episodes_recalled', { hits: out.hits.length });
  return out.hits;
}
