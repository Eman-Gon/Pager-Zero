import { ScrollText, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { incidents } from '@/lib/mock-data';

// Derive the runbook memory from incidents that cited one — this is the
// GraphRAG knowledge base that lets past fixes accelerate future ones.
const runbooks = Array.from(
  new Map(
    incidents
      .filter((i) => i.citedRunbook)
      .map((i) => [i.citedRunbook!, i]),
  ).values(),
);

export function RunbookMemory() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="size-4" /> Runbook memory
        </CardTitle>
        <CardDescription>
          Fix patterns the system has learned. GraphRAG means the agent searches this memory
          through the Neo4j graph and cites the best match during diagnosis.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {runbooks.map((r) => (
          <div
            key={r.citedRunbook}
            className="rounded-lg border bg-background/50 p-4 transition-colors hover:border-ring/30"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{r.citedRunbook}</p>
              <Sparkles className="size-4 shrink-0 text-warning" />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="font-mono">
                {r.rootCause}
              </Badge>
              <span>· last cited {r.id}</span>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              If this root cause appears again, the agent can reuse this pattern as supporting context.
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
