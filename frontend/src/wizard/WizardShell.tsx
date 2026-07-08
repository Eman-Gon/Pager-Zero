import { useCallback, useEffect, useState } from 'react';
import { fetchMissionSnapshot, injectIncident, resetIncident, type Incident, type MissionSnapshot } from '../api';
import GraphPanel from '../panels/GraphPanel';
import TracePanel from '../panels/TracePanel';
import SandboxPanel from '../panels/SandboxPanel';
import ApprovalPanel from '../panels/ApprovalPanel';
import ShipPanel from '../panels/ShipPanel';
import { ResultBadge } from '../components/ActionProgress';
import { STEPS, isStepComplete, type StepId } from './steps';

function DetectStep({ incident }: { incident: Incident | null }) {
  const [arming, setArming] = useState<'break' | 'reset' | null>(null);
  const [demoErr, setDemoErr] = useState<string | null>(null);
  // The sensor picks up the commit on its next ~2s poll; the App-level
  // incident poller then flips the UI. Keep the spinner until it does.
  useEffect(() => {
    if (arming === 'break' && incident?.status === 'incident') setArming(null);
    if (arming === 'reset' && incident?.status === 'ok') setArming(null);
  }, [arming, incident?.status]);

  const fire = async (kind: 'break' | 'reset') => {
    setDemoErr(null);
    setArming(kind);
    try {
      await (kind === 'break' ? injectIncident() : resetIncident());
    } catch (err) {
      setArming(null);
      setDemoErr(err instanceof Error ? err.message : String(err));
    }
  };

  if (incident?.status !== 'incident') {
    return (
      <div className="detect-clear">
        <ResultBadge kind="ok">all clear</ResultBadge>
        <p className="muted">
          No active incident. The sensor is watching the patient repo — inject the scripted
          incident to arm the pipeline live.
        </p>
        <button className="danger" disabled={arming !== null} onClick={() => fire('break')}>
          {arming === 'break' ? 'breaking production…' : '💥 Break production'}
        </button>
        {demoErr && <p className="muted" style={{ color: 'var(--bad, #f2647f)' }}>{demoErr}</p>}
      </div>
    );
  }
  return (
    <div className="detect-card">
      <div className="detect-row">
        <span className="detect-label">status</span>
        <ResultBadge kind="bad">incident detected</ResultBadge>
        <button
          style={{ marginLeft: 'auto' }}
          disabled={arming !== null}
          onClick={() => fire('reset')}
        >
          {arming === 'reset' ? 'restoring…' : 'restore good state'}
        </button>
      </div>
      <div className="detect-row">
        <span className="detect-label">root cause</span>
        <code>{incident.root_cause}</code>
      </div>
      <div className="detect-block">
        <span className="detect-label">blast radius</span>
        <div className="chip-row">
          {incident.blast_radius.map((fn) => (
            <span key={fn} className="chip">{fn}</span>
          ))}
        </div>
      </div>
      <div className="detect-block">
        <span className="detect-label">failing tests</span>
        <div className="chip-row">
          {incident.failing_tests.map((t) => (
            <span key={t} className="chip chip-bad">{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WizardShell({
  token,
  incident,
  tick,
  bump,
}: {
  token: string;
  incident: Incident | null;
  tick: number;
  bump: () => void;
}) {
  const [snap, setSnap] = useState<MissionSnapshot | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  const refresh = useCallback(() => {
    fetchMissionSnapshot(token)
      .then(setSnap)
      .catch(() => {});
  }, [token]);

  // Poll the snapshot so step completion updates even when a panel action
  // (e.g. Diagnose) doesn't explicitly notify the parent.
  useEffect(() => {
    refresh();
    const h = setInterval(refresh, 4000);
    return () => clearInterval(h);
  }, [refresh, tick]);

  const step = STEPS[stepIdx];
  const currentComplete = isStepComplete(step.id, snap);
  const isLast = stepIdx === STEPS.length - 1;

  // Free navigation: every step is reachable so the operator can jump around
  // (and reach Diagnose) even before an incident is live. Completion still
  // drives the colored state on each step, it just no longer locks the flow.
  function goTo(idx: number) {
    if (idx < 0 || idx >= STEPS.length) return;
    setStepIdx(idx);
  }

  function stepState(idx: number): 'done' | 'active' | 'ready' {
    if (idx === stepIdx) return 'active';
    if (isStepComplete(STEPS[idx].id, snap)) return 'done';
    return 'ready';
  }

  // Panels notify + we refetch so the Next button unlocks promptly.
  const onChanged = useCallback(() => {
    bump();
    refresh();
  }, [bump, refresh]);

  function renderBody(id: StepId) {
    switch (id) {
      case 'detect':
        return <DetectStep incident={incident} />;
      case 'diagnose':
        return <TracePanel token={token} incident={incident} tick={tick} />;
      case 'verify':
        return <SandboxPanel token={token} incident={incident} tick={tick} onChanged={onChanged} />;
      case 'ship':
        return (
          <div className="panel-stack">
            {snap?.pipeline.approval_pending && (
              <div className="result-card result-card-warn">
                <ResultBadge kind="warn">approval required</ResultBadge>
                <p className="muted panel-hint">
                  This fix was flagged as high-risk. Approve or deny below to resolve the gate.
                </p>
              </div>
            )}
            <ShipPanel token={token} tick={tick} onChanged={onChanged} />
            <ApprovalPanel token={token} tick={tick} onChanged={onChanged} />
          </div>
        );
    }
  }

  return (
    <div className="wizard">
      <ol className="wizard-stepper">
        {STEPS.map((s, i) => {
          const state = stepState(i);
          return (
            <li key={s.id} className={`wstep wstep-${state}`}>
              <button type="button" className="wstep-btn" onClick={() => goTo(i)}>
                <span className="wstep-num">{state === 'done' ? '✓' : i + 1}</span>
                <span className="wstep-text">
                  <span className="wstep-label">{s.label}</span>
                  <span className="wstep-tool">{s.tool}</span>
                </span>
              </button>
              {i < STEPS.length - 1 && <span className="wstep-line" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <div className="wizard-body">
        <div className="wizard-graph">
          <div className="wizard-graph-head">Code graph</div>
          <GraphPanel incident={incident} />
        </div>

        <div className="wizard-main">
          <div className="wizard-step-head">
            <div className="wizard-step-index">
              step {stepIdx + 1} / {STEPS.length}
            </div>
            <h2>{step.title}</h2>
            <p className="muted">{step.blurb}</p>
          </div>

          <div className="wizard-step-content">{renderBody(step.id)}</div>

          <div className="wizard-nav">
            <button type="button" disabled={stepIdx === 0} onClick={() => goTo(stepIdx - 1)}>
              ← Back
            </button>
            <div className="spacer" />
            {!isLast ? (
              <button type="button" className="wizard-next" onClick={() => goTo(stepIdx + 1)}>
                Next →
              </button>
            ) : (
              <ResultBadge kind={currentComplete ? 'ok' : 'info'}>
                {currentComplete ? 'incident resolved' : 'awaiting ship'}
              </ResultBadge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
