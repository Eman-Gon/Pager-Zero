import { AppShell } from '@/components/app-shell';
import { RunbookMemory } from '@/components/dashboard/runbook-memory';
import { PageFrame } from '@/components/page-frame';

export default function RunbooksPage() {
  return (
    <AppShell>
      <PageFrame
        title="Runbook Memory"
        subtitle="Past fixes the agent remembers and reuses on new incidents."
      >
        <RunbookMemory />
      </PageFrame>
    </AppShell>
  );
}
