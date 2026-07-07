import { useEffect, useState } from 'react';
import { fetchHealth, type HealthStatus } from '../api';

function pill(label: string, ok: boolean | 'warn', title?: string) {
  const cls = ok === true ? 'dep-ok' : ok === 'warn' ? 'dep-warn' : 'dep-bad';
  return (
    <span key={label} className={`dep-pill ${cls}`} title={title}>
      {label}
    </span>
  );
}

export default function StatusBar() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const h = await fetchHealth();
        if (alive) setHealth(h);
      } catch {
        if (alive) setHealth(null);
      }
    };
    poll();
    const t = setInterval(poll, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!health) return <div className="statusbar muted">checking dependencies…</div>;

  const rr = health.rocketride;
  const rrOk = rr.connected;
  const rrTitle = rr.connected ? rr.uri : 'RocketRide Cloud disconnected — Diagnose unavailable';
  const tools = health.tools;

  return (
    <div className="statusbar">
      <span className="statusbar-label">deps</span>
      {pill('sensor', health.sensor)}
      {pill('neo4j', health.neo4j)}
      {pill('rocketride', rrOk, rrTitle)}
      {pill('butterbase', health.butterbase, health.butterbase ? 'persistence + auth active' : 'not configured')}
      {tools?.daytona === false && pill('daytona', false, 'not configured')}
      {tools?.github === false && pill('github', false, 'not configured')}
    </div>
  );
}
