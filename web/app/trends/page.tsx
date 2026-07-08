import { AppShell } from '@/components/app-shell';
import { IncidentTrendChart, MttrChart, SeverityChart } from '@/components/dashboard/charts';
import { PageFrame } from '@/components/page-frame';

export default function TrendsPage() {
  return (
    <AppShell>
      <PageFrame
        title="Trends & MTTR"
        subtitle="Operational trend lines for incident volume, restore time, and severity mix."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <IncidentTrendChart />
          <MttrChart />
          <SeverityChart />
        </div>
      </PageFrame>
    </AppShell>
  );
}
