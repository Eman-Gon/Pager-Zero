import { AppShell } from '@/components/app-shell';
import { Neo4jNodes } from '@/components/dashboard/neo4j-nodes';
import { PageFrame } from '@/components/page-frame';

export default function Neo4jPage() {
  return (
    <AppShell>
      <PageFrame
        title="Neo4j Nodes"
        subtitle="Code graph inventory for functions, tests, runbooks, and their relationships."
      >
        <Neo4jNodes />
      </PageFrame>
    </AppShell>
  );
}
