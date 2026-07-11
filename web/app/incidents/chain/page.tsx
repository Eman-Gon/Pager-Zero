import { AppShell } from '@/components/app-shell';
import { IncidentChainFlow } from '@/components/dashboard/incident-chain-flow';
import { RepoLoader } from '@/components/dashboard/repo-loader';
import { PageFrame } from '@/components/page-frame';

export default function IncidentChainPage() {
  return (
    <AppShell>
      <PageFrame
        title="Incident Chain"
        subtitle="Run the same Detect, Diagnose, Verify, and Ship sequence from the original Mission Control flow."
      >
        <RepoLoader />
        <IncidentChainFlow />
      </PageFrame>
    </AppShell>
  );
}
