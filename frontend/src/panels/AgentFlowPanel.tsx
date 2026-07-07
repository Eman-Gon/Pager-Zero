import { useEffect, useState } from 'react';
import { fetchMissionSnapshot, type MissionSnapshot } from '../api';

type StepState = 'off' | 'ready' | 'active' | 'done' | 'blocked' | 'error';

interface FlowStep {
  tool: string;
  label: string;
  state: StepState;
  detail: string;
}

function buildSteps(s: MissionSnapshot): FlowStep[] {
  const { health, live, pipeline, openIncident } = s;
  const incidentLive = live?.status === 'incident';
  const needsApproval = pipeline.severity === 'high';

  return [
    {
      tool: 'sensor',
      label: 'Detect',
      state: !health.sensor ? 'blocked' : incidentLive ? 'done' : 'ready',
      detail: incidentLive
        ? `root cause ${live?.root_cause}`
        : health.sensor
          ? 'all clear'
          : 'sensor offline',
    },
    {
      tool: 'neo4j',
      label: 'Code graph',
      state: !health.neo4j ? 'blocked' : incidentLive ? 'done' : 'off',
      detail: health.neo4j ? 'graph + blast radius' : 'bolt unreachable',
    },
    {
      tool: 'nebius',
      label: 'Runbooks',
      state: !health.tools.nebius
        ? 'blocked'
        : pipeline.has_diagnose
          ? 'done'
          : incidentLive
            ? 'ready'
            : 'off',
      detail: health.tools.nebius ? 'vector GraphRAG' : 'NEBIUS_* not set',
    },
    {
      tool: 'rocketride',
      label: 'Diagnose',
      state: pipeline.has_diagnose
        ? 'done'
        : !health.tools.rocketride
          ? 'blocked'
          : !health.rocketride.connected
            ? 'blocked'
            : incidentLive
              ? 'active'
              : 'off',
      detail: pipeline.has_diagnose
        ? `severity ${pipeline.severity ?? '?'}`
        : health.rocketride.connected
          ? 'RocketRide Cloud ready'
          : 'RocketRide disconnected',
    },
    {
      tool: 'daytona',
      label: 'Verify',
      state: pipeline.has_verified_fix
        ? 'done'
        : !health.tools.daytona
          ? 'blocked'
          : pipeline.has_diagnose || incidentLive
            ? 'ready'
            : 'off',
      detail: pipeline.has_verified_fix
        ? 'fix verified green'
        : health.tools.daytona
          ? 'Daytona sandbox'
          : 'DAYTONA_API_KEY not set',
    },
    {
      tool: 'policy',
      label: 'Approval',
      state: pipeline.approval_denied
        ? 'error'
        : pipeline.approval_pending
          ? 'active'
          : pipeline.shipped || (pipeline.has_verified_fix && !needsApproval)
            ? 'done'
            : pipeline.has_verified_fix && needsApproval
              ? 'ready'
              : 'off',
      detail: pipeline.approval_denied
        ? 'denied by human'
        : pipeline.approval_pending
          ? 'waiting for approve'
          : needsApproval
            ? 'high severity gate'
            : 'auto-ship eligible',
    },
    {
      tool: 'github',
      label: 'Ship PR',
      state: pipeline.shipped
        ? 'done'
        : !health.tools.github
          ? 'blocked'
          : pipeline.has_verified_fix && !pipeline.approval_pending && !pipeline.approval_denied
            ? 'ready'
            : 'off',
      detail: pipeline.shipped
        ? `resolved · MTTR ${openIncident?.mttr_seconds ?? '?'}s`
        : health.tools.github
          ? 'GitHub API'
          : 'GITHUB_* not set',
    },
    {
      tool: 'butterbase',
      label: 'Persist',
      state: !health.butterbase ? 'blocked' : s.account ? 'done' : 'ready',
      detail: s.account
        ? `${s.account.plan} · ${s.account.apply_credits} credits`
        : 'auth + Data API',
    },
  ];
}

function stateClass(state: StepState): string {
  switch (state) {
    case 'done':
      return 'flow-done';
    case 'active':
      return 'flow-active';
    case 'ready':
      return 'flow-ready';
    case 'blocked':
    case 'error':
      return 'flow-bad';
    default:
      return 'flow-off';
  }
}

function stateIcon(state: StepState): string {
  switch (state) {
    case 'done':
      return '✓';
    case 'active':
      return '●';
    case 'ready':
      return '○';
    case 'blocked':
      return '✗';
    case 'error':
      return '!';
    default:
      return '–';
  }
}

export default function AgentFlowPanel({ token, tick }: { token: string; tick: number }) {
  const [snap, setSnap] = useState<MissionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMissionSnapshot(token)
      .then((s) => {
        if (!alive) return;
        setSnap(s);
        setUpdated(new Date());
        setError(null);
      })
      .catch((err) => alive && setError(String(err)));
    return () => {
      alive = false;
    };
  }, [token, tick]);

  if (error) return <div className="err">{error}</div>;
  if (!snap) return <div className="muted">loading agent ops…</div>;

  const steps = buildSteps(snap);
  const working = steps.filter((s) => s.state === 'done' || s.state === 'active').length;
  const blocked = steps.filter((s) => s.state === 'blocked' || s.state === 'error').length;
  const { stats, account } = snap;

  return (
    <div className="agent-ops">
      <div className="stats-grid">
        <div className="stat">
          <span className="stat-val">{stats.incidents_total}</span>
          <span className="stat-lbl">incidents</span>
        </div>
        <div className="stat">
          <span className="stat-val">{stats.diagnoses}</span>
          <span className="stat-lbl">diagnoses</span>
        </div>
        <div className="stat">
          <span className="stat-val">{stats.remediates_verified}</span>
          <span className="stat-lbl">verified fixes</span>
        </div>
        <div className="stat">
          <span className="stat-val">{stats.approvals_pending}</span>
          <span className="stat-lbl">pending approvals</span>
        </div>
        <div className="stat">
          <span className="stat-val">{stats.avg_mttr_seconds != null ? `${stats.avg_mttr_seconds}s` : '—'}</span>
          <span className="stat-lbl">avg MTTR</span>
        </div>
        <div className="stat">
          <span className={`stat-val ${(account?.apply_credits ?? 0) > 0 ? 'sev-low' : 'sev-high'}`}>
            {account?.apply_credits ?? 0}
          </span>
          <span className="stat-lbl">credits left</span>
        </div>
      </div>

      <div className="flow-header">
        <span className="muted">
          pipeline {working}/{steps.length} steps active · {blocked} blocked
        </span>
        {updated && <span className="muted">updated {updated.toLocaleTimeString()}</span>}
      </div>

      <div className="flow-track">
        {steps.map((step, i) => (
          <div key={step.tool} className="flow-step-wrap">
            <div className={`flow-step ${stateClass(step.state)}`} title={step.detail}>
              <span className="flow-icon">{stateIcon(step.state)}</span>
              <span className="flow-tool">{step.tool}</span>
              <span className="flow-label">{step.label}</span>
              <span className="flow-detail">{step.detail}</span>
            </div>
            {i < steps.length - 1 && <span className="flow-arrow">→</span>}
          </div>
        ))}
      </div>

      <div className="flow-legend muted">
        ✓ done · ● active · ○ ready · ✗ blocked · – idle
      </div>
    </div>
  );
}
