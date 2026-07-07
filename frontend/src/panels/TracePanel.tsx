import { useEffect, useState } from 'react';
import { ActionProgress, ResultBadge } from '../components/ActionProgress';
import { diagnose, fetchPersistedActions, type Diagnosis, type Incident } from '../api';

const DIAGNOSE_STEPS = [
  { id: 'sensor', label: 'Sensor', detail: 'Read incident + failing tests' },
  { id: 'neo4j', label: 'Neo4j', detail: 'Code graph + vector runbooks' },
  { id: 'rocketride', label: 'RocketRide', detail: 'LLM diagnosis pipeline' },
  { id: 'persist', label: 'Butterbase', detail: 'Persist agent trace' },
];

function traceFromPayload(payload: { trace?: Diagnosis } | null | undefined): Diagnosis | null {
  const t = payload?.trace;
  if (!t?.root_cause_explanation) return null;
  return t;
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
      .catch(() => {});
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
    try {
      const { status, data } = await diagnose(token);
      if (status !== 200) throw new Error(data.error ?? `HTTP ${status}`);
      if (data.status === 'ok') {
        setError('no incident — nothing to diagnose');
      } else {
        setResult(data.diagnosis);
        setDone(true);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-stack">
      <div className="row panel-actions">
        <button disabled={busy || incident?.status !== 'incident'} onClick={run}>
          {busy ? 'Diagnosing…' : 'Diagnose'}
        </button>
        {restored && result && !busy && <ResultBadge kind="info">restored from Butterbase</ResultBadge>}
        {done && result && !busy && <ResultBadge kind="ok">diagnosis complete</ResultBadge>}
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
