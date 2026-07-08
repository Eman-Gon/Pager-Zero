import { AppShell } from '@/components/app-shell';
import { ProjectOverview } from '@/components/dashboard/project-overview';
import { PageFrame } from '@/components/page-frame';

export default function Page() {
  return (
    <AppShell>
      <PageFrame
        eyebrow="Project overview"
        title="PagerZero in plain English"
        subtitle="An autonomous on-call engineer that detects software incidents, finds the likely root cause, verifies a fix, and opens a pull request when it is safe."
      >
        <ProjectOverview />
      </PageFrame>
    </AppShell>
  );
}
