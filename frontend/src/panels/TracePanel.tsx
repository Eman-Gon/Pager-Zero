import { useEffect, useState } from 'react';
import { diagnose, fetchPersistedActions, type Diagnosis, type Incident } from '../api';

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
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token, tick]);

  async function run() {
    setBusy(true);
    setError(null);
    setRestored(false);
    try {
      const { status, data } = await diagnose(token);
      if (status !== 200) throw new Error(data.error ?? `HTTP ${status}`);
      if (data.status === 'ok') {
        setResult(null);
        setError('no incident — nothing to diagnose');
      } else {
        setResult(data.diagnosis);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <button disabled={busy || incident?.status !== 'incident'} onClick={run}>
          {busy ? 'Reasoning on RocketRide Cloud…' : 'Diagnose'}
        </button>
        {restored && result && <span className="muted">restored from Butterbase</span>}
      </div>
      {error && <div className="err">{error}</div>}
      {result && (
        <>
          <div className="kv">
            <b>severity</b>
            <span className={`sev-${result.severity}`}>{result.severity}</span>
          </div>
          <div className="kv">
            <b>root cause</b>
            {result.root_cause_explanation}
          </div>
          <div className="kv">
            <b>proposed fix</b>
            {result.proposed_fix_approach}
          </div>
          <div className="kv">
            <b>cited runbook</b>
            {result.cited_runbook ?? <span className="muted">none</span>}
          </div>
        </>
      )}
      {!result && !error && <div className="muted">Run a diagnosis to see the agent's reasoning.</div>}
    </div>
  );
}
