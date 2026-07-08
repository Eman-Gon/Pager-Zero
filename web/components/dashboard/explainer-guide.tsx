import { Activity, CheckCircle2, Clock, Database, GitBranch, GitPullRequest, ScrollText, Siren } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const journey = [
  {
    title: 'Detect',
    icon: Siren,
    copy: 'An alert opens an incident.',
    tone: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200',
  },
  {
    title: 'Diagnose',
    icon: GitBranch,
    copy: 'The agent points to the likely broken function.',
    tone: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200',
  },
  {
    title: 'Verify',
    icon: CheckCircle2,
    copy: 'Tests check the candidate fix.',
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  },
  {
    title: 'Ship',
    icon: GitPullRequest,
    copy: 'Safe fixes become PRs; risky ones wait.',
    tone: 'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-200',
  },
];

const glossary = [
  {
    term: 'Incident',
    meaning: 'Problem under response.',
  },
  {
    term: 'Root cause',
    meaning: 'Likely broken function.',
  },
  {
    term: 'Blast radius',
    meaning: 'Code or tests affected.',
  },
  {
    term: 'MTTR',
    meaning: 'Time to restore service.',
  },
  {
    term: 'Neo4j',
    meaning: 'Graph linking code, tests, and runbooks.',
  },
  {
    term: 'Runbook memory',
    meaning: 'Reusable fixes from past incidents.',
  },
];

export function ExplainerGuide() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-accent/30">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-3 text-base">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <Activity className="size-4" />
              </span>
              Response flow
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl leading-6">
              What broke, why it broke, what was checked, and whether a fix is ready.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit border border-primary/20 bg-primary/10 text-primary">
            Plain-English guide
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
        <div className="grid gap-3">
          {journey.map((step) => (
            <div
              key={step.title}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border border-border/80 bg-muted/20 p-4"
            >
              <span className={cn('grid size-9 place-items-center rounded-lg border', step.tone)}>
                <step.icon className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{step.title}</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.copy}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ScrollText className="size-4 text-primary" />
            Key terms
          </div>
          <dl className="divide-y divide-border/70 text-sm">
            {glossary.map((item) => (
              <div key={item.term} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[128px_minmax(0,1fr)]">
                <dt className="font-medium text-foreground">{item.term}</dt>
                <dd className="leading-6 text-muted-foreground">{item.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
      <CardContent className="grid gap-3 border-t border-border/70 bg-muted/10 text-sm text-muted-foreground sm:grid-cols-3">
        <div className="flex gap-2 rounded-lg border border-border/70 bg-card/60 p-3">
          <Database className="mt-0.5 size-4 shrink-0 text-cyan-500" />
          Graph map
        </div>
        <div className="flex gap-2 rounded-lg border border-border/70 bg-card/60 p-3">
          <Clock className="mt-0.5 size-4 shrink-0 text-amber-500" />
          Restore speed
        </div>
        <div className="flex gap-2 rounded-lg border border-border/70 bg-card/60 p-3">
          <GitPullRequest className="mt-0.5 size-4 shrink-0 text-violet-500" />
          Approval gate
        </div>
      </CardContent>
    </Card>
  );
}
