import { AppShell } from '@/components/app-shell';
import { KpiCards } from '@/components/dashboard/kpi-cards';
import { IncidentTrendChart, MttrChart, SeverityChart } from '@/components/dashboard/charts';
import { IncidentTable } from '@/components/dashboard/incident-table';
import { RunbookMemory } from '@/components/dashboard/runbook-memory';

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
              Autonomous incident response at a glance — detection through shipped fix.
            </p>
          </div>
          <KpiCards />
        </section>

        {/* Incidents */}
        <section className="flex flex-col gap-4">
          <SectionHeading
            id="incidents"
            title="Incident queue"
            subtitle="Click any row for root cause, blast radius, and the cited runbook."
          />
          <IncidentTable />
        </section>

        {/* Trends */}
        <section className="flex flex-col gap-4">
          <SectionHeading
            id="trends"
            title="Trends & MTTR"
            subtitle="How detection volume, auto-ship rate, and time-to-restore are moving."
          />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <IncidentTrendChart />
            <MttrChart />
            <SeverityChart />
          </div>
        </section>

        {/* Runbooks */}
        <section className="flex flex-col gap-4">
          <SectionHeading
            id="runbooks"
            title="Runbook memory"
            subtitle="The GraphRAG knowledge base that accelerates recurring fixes."
          />
          <RunbookMemory />
        </section>
      </div>
    </AppShell>
  );
}
