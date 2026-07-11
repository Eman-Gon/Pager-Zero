import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { PageFrame } from '@/components/page-frame';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function IncidentStartPage() {
  return (
    <AppShell>
      <PageFrame
        title="Incident Start"
        subtitle="Start a guided incident response chain that mirrors the previous mission flow."
      >
        <Card>
          <CardHeader>
            <CardTitle>What this run does</CardTitle>
            <CardDescription>
              The chain walks through Detect, Diagnose, Verify, and Ship, with Neo4j snapshots around
              the repair so the graph stays visible.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Detect and confirm the current incident.</li>
              <li>Diagnose root cause with the responder pipeline.</li>
              <li>Capture knowledge graph snapshot before fixing.</li>
              <li>Run remediation verify in Daytona sandbox.</li>
              <li>Capture knowledge graph snapshot after fix candidate.</li>
              <li>Ship PR (auto-approve if policy gates approval).</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/incidents/chain">Start chain</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/incidents">Back to queue</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageFrame>
    </AppShell>
  );
}
