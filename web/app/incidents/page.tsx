import { AppShell } from '@/components/app-shell';
import { IncidentTable } from '@/components/dashboard/incident-table';
import { PageFrame } from '@/components/page-frame';

export default function IncidentsPage() {
  return (
    <AppShell>
      <PageFrame
        title="Incident Queue"
        subtitle="Detected problems, suspected root causes, affected code, and response status."
      >
        <IncidentTable />
      </PageFrame>
    </AppShell>
  );
}
