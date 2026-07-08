import { AppShell } from '@/components/app-shell';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { IncidentTrendChart, MttrChart, SeverityChart } from '@/components/dashboard/charts';
import { IncidentTable } from '@/components/dashboard/incident-table';
import { Neo4jNodes } from '@/components/dashboard/neo4j-nodes';
import { RunbookMemory } from '@/components/dashboard/runbook-memory';
import { ExplainerGuide } from '@/components/dashboard/explainer-guide';

function SectionHeading({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <div id={id} className="scroll-mt-20">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export default function Page() {
  return (
    <AppShell>
      <div className="mx-auto flex max-w-6xl flex-col gap-8 animate-fade-in">
        {/* Overview */}
        <section className="flex flex-col gap-4">
          <div id="overview" className="scroll-mt-20">
            <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
            <p className="text-sm text-muted-foreground">
              Autonomous incident response at a glance: detection, diagnosis, verification, and shipped fixes.
            </p>
          </div>
          <ExplainerGuide />
          <KpiCards />
        </section>

        {/* Incidents */}
        <section className="flex flex-col gap-4">
          <SectionHeading
            id="incidents"
            title="Incident queue"
            subtitle="Each row is a problem the system detected. Open one to see the likely cause, affected code, and fix status."
          />
          <IncidentTable />
        </section>

        {/* Trends */}
        <section className="flex flex-col gap-4">
          <SectionHeading
            id="trends"
            title="Trends & MTTR"
            subtitle="These charts show whether the agent is catching issues, restoring faster, and reducing manual work."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <IncidentTrendChart />
            <MttrChart />
            <SeverityChart />
          </div>
        </section>

        {/* Neo4j */}
        <section className="flex flex-col gap-4">
          <SectionHeading
            id="neo4j"
            title="Neo4j nodes"
            subtitle="Neo4j stores the code graph: functions, tests, runbooks, and how they connect."
          />
          <Neo4jNodes />
        </section>

        {/* Runbooks */}
        <section className="flex flex-col gap-4">
          <SectionHeading
            id="runbooks"
            title="Runbook memory"
            subtitle="Runbooks are reusable fix patterns. The agent cites them when a similar root cause comes back."
          />
          <RunbookMemory />
        </section>
      </div>
    </AppShell>
  );
}
