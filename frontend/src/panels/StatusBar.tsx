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

  const llm = health.llm;
  const llmOk = llm.configured;
  const llmTitle = llmOk ? `${llm.provider} · ${llm.model}` : 'LLM not configured — Diagnose unavailable';
  const tools = health.tools;
  const graphNodes = health.graph ? Object.values(health.graph.nodes).reduce((sum, n) => sum + n, 0) : 0;
  const graphRels = health.graph ? Object.values(health.graph.relationships).reduce((sum, n) => sum + n, 0) : 0;
  const graphTitle = health.graph
    ? `${graphNodes} nodes · ${graphRels} relationships · ${health.graph.changed_functions} changed`
    : 'graph summary unavailable';

  return (
    <div className="statusbar">
      <span className="statusbar-label">deps</span>
      {pill('sensor', health.sensor)}
      {pill('neo4j', health.neo4j)}
      {pill(`graph ${graphNodes}n`, health.graph ? true : 'warn', graphTitle)}
      {pill('llm', llmOk, llmTitle)}
      {pill('butterbase', health.butterbase, health.butterbase ? 'persistence + auth active' : 'not configured')}
      {tools?.daytona === false && pill('daytona', false, 'not configured')}
      {tools?.github === false && pill('github', false, 'not configured')}
    </div>
  );
}
