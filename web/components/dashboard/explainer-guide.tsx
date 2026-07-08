import { Activity, CheckCircle2, Clock, Database, GitBranch, GitPullRequest, ScrollText, Siren } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const journey = [
  {
    title: 'Detect',
    icon: Siren,
    copy: 'The sensor or an alert source notices a break and opens an incident.',
  },
  {
    title: 'Diagnose',
    icon: GitBranch,
    copy: 'The agent finds the likely root-cause function and the code paths affected by it.',
  },
  {
    title: 'Verify',
    icon: CheckCircle2,
    copy: 'The candidate fix is tested before the system treats it as safe to ship.',
  },
  {
    title: 'Ship',
    icon: GitPullRequest,
    copy: 'A low-risk fix can become a pull request; risky changes wait for approval.',
  },
];

const glossary = [
  {
    term: 'Incident',
    meaning: 'A live or recent problem the system is trying to explain and fix.',
  },
  {
    term: 'Root cause',
    meaning: 'The function most likely responsible for the break.',
  },
  {
    term: 'Blast radius',
    meaning: 'Other functions, tests, or workflows that depend on the broken function.',
  },
  {
    term: 'MTTR',
    meaning: 'Mean time to restore: how long it takes to get back to a healthy state.',
  },
  {
    term: 'Neo4j',
    meaning: 'The graph database that stores functions, tests, runbooks, and their links.',
  },
  {
    term: 'Runbook memory',
    meaning: 'Reusable fix patterns the agent can cite when a similar issue appears again.',
  },
];

export function ExplainerGuide() {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> What am I looking at?
            </CardTitle>
            <CardDescription>
              This page is the operator view for RescueOps++: it shows what broke, why it broke,
              what the agent checked, and whether a fix is ready to ship.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit">
            Plain-English guide
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          {journey.map((step) => (
            <div key={step.title} className="rounded-lg border bg-background/50 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <step.icon className="size-4 text-muted-foreground" />
                {step.title}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.copy}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border bg-background/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ScrollText className="size-4 text-muted-foreground" />
            Key terms
          </div>
          <dl className="grid gap-2 text-xs">
            {glossary.map((item) => (
              <div key={item.term} className="grid gap-1 sm:grid-cols-[96px_minmax(0,1fr)]">
                <dt className="font-medium text-foreground">{item.term}</dt>
                <dd className="leading-5 text-muted-foreground">{item.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
      <CardContent className="grid gap-3 border-t pt-5 text-xs text-muted-foreground sm:grid-cols-3">
        <div className="flex gap-2">
          <Database className="mt-0.5 size-4 shrink-0" />
          Neo4j is the live map behind the dashboard.
        </div>
        <div className="flex gap-2">
          <Clock className="mt-0.5 size-4 shrink-0" />
          Lower restore time means incidents are closing faster.
        </div>
        <div className="flex gap-2">
          <GitPullRequest className="mt-0.5 size-4 shrink-0" />
          Pending approval means the agent found a fix but needs a human gate.
        </div>
      </CardContent>
    </Card>
  );
}
