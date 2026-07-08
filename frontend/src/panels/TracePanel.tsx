import { useEffect, useState } from 'react';
import { ActionProgress, ResultBadge } from '../components/ActionProgress';
import { diagnose, fetchPersistedActions, type Diagnosis, type Incident } from '../api';

const DIAGNOSE_STEPS = [
  { id: 'sensor', label: 'Sensor', detail: 'Read incident + failing tests' },
  { id: 'neo4j', label: 'Neo4j', detail: 'Code graph + vector runbooks' },
  { id: 'llm', label: 'LLM', detail: 'Diagnosis + candidate fix' },
  { id: 'persist', label: 'Butterbase', detail: 'Persist agent trace' },
];

function traceFromPayload(payload: { trace?: Diagnosis } | null | undefined): Diagnosis | null {
  const t = payload?.trace;
  if (!t?.root_cause_explanation) return null;
  return t;
}

function diagnoseError(status: number, data: { error?: string; message?: string } | null | undefined): string {
  const serverMessage = data?.message ?? data?.error;
  if (serverMessage) return serverMessage;
  if (status === 404) {
    return 'Responder route not found. In local dev, open the React app on http://127.0.0.1:5173; port 3004 is the responder API.';
  }
  if (status === 401) return 'Sign in again, then retry diagnosis.';
  return `Diagnosis request failed with HTTP ${status}.`;
}

export default function TracePanel({
  token,
  incident,
  tick,
}: {
  token: string;
  incident: Incident | null;
  tick: number;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [pipeline, setPipeline] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPersistedActions(token)
      .then(({ diagnose: row }) => {
        if (!alive) return;
        const trace = traceFromPayload(row?.candidate_fix);
        if (trace) {
          setResult(trace);
          setRestored(true);
          setDone(true);
        }
      })
      .catch((err) => console.warn('trace restore failed', err));
    return () => {
      alive = false;
    };
  }, [token, tick]);

  async function run() {
    setBusy(true);
    setDone(false);
    setError(null);
    setRestored(false);
    setResult(null);
    setPipeline(null);
    try {
      const { status, data } = await diagnose(token);
      if (status !== 200) throw new Error(diagnoseError(status, data));
      if (data.status === 'ok') {
        setError('no incident — nothing to diagnose');
      } else {
        setResult(data.diagnosis);
        setPipeline(data.pipeline ?? null);
        setDone(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-stack">
      <div className="row panel-actions">
        <button disabled={busy} onClick={run}>
          {busy ? 'Diagnosing…' : incident?.status === 'incident' ? 'Diagnose' : 'Diagnose repo'}
        </button>
        {restored && result && !busy && <ResultBadge kind="info">restored from Butterbase</ResultBadge>}
        {done && result && !busy && <ResultBadge kind="ok">diagnosis complete</ResultBadge>}
        {pipeline && !busy && <ResultBadge kind="info">{pipeline}</ResultBadge>}
      </div>

      <ActionProgress
        steps={DIAGNOSE_STEPS}
        active={busy}
        done={done && !!result && !error}
        error={!!error}
        title="Agent diagnosis"
      />

      {error && <div className="err">{error}</div>}

      {result && !busy && (
        <div className="result-card">
          <div className="result-card-header">
            <span className="muted">severity</span>
            <ResultBadge kind={result.severity === 'high' ? 'bad' : result.severity === 'medium' ? 'warn' : 'ok'}>
              {result.severity}
            </ResultBadge>
          </div>
          <div className="result-block">
            <div className="result-block-label">Root cause</div>
            <p>{result.root_cause_explanation}</p>
          </div>
          <div className="result-block">
            <div className="result-block-label">Proposed fix</div>
            <p>{result.proposed_fix_approach}</p>
          </div>
          <div className="result-block">
            <div className="result-block-label">Cited runbook</div>
            <p>{result.cited_runbook ?? <span className="muted">none</span>}</p>
          </div>
        </div>
      )}

      {!result && !error && !busy && (
        <div className="muted panel-hint">Run a diagnosis to see the agent&apos;s reasoning.</div>
      )}
    </div>
  );
}
