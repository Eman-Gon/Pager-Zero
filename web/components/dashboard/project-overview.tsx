import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Database,
  GitPullRequest,
  Network,
  SearchCheck,
  ShieldCheck,
  Siren,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const responseLoop = [
  {
    title: '1. Detect the break',
    copy: 'A code scan, PagerDuty alert, or Sentry issue creates an incident when something starts failing.',
    icon: Siren,
  },
  {
    title: '2. Find the cause',
    copy: 'The responder uses the code graph, tests, and runbook memory to identify the function most likely responsible.',
    icon: SearchCheck,
  },
  {
    title: '3. Prove the fix',
    copy: 'A candidate patch runs through verification before the system treats it as safe.',
    icon: CheckCircle2,
  },
  {
    title: '4. Ship or ask',
    copy: 'Low-risk fixes can become pull requests. Risky changes stop at a human approval gate.',
    icon: GitPullRequest,
  },
];

const pieces = [
  {
    name: 'Sensor',
    role: 'Watches the target codebase and turns failures into incidents.',
    icon: Network,
  },
  {
    name: 'Responder',
    role: 'Diagnoses the issue, proposes a fix, verifies it, and prepares the PR.',
    icon: Code2,
  },
  {
    name: 'Neo4j memory',
    role: 'Stores the code graph, affected paths, runbooks, and repeated fix patterns.',
    icon: Database,
  },
  {
    name: 'Policy gate',
    role: 'Keeps risky changes from shipping without approval.',
    icon: ShieldCheck,
  },
];

export function ProjectOverview() {
  return (
    <div className="grid gap-6">
      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-xl leading-7">What PagerZero is</CardTitle>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  PagerZero is an autonomous on-call engineer for software incidents. It watches a
                  repository, figures out what broke, tests a repair, and opens a pull request when
                  the fix is safe.
                </p>
              </div>
              <Badge variant="secondary" className="w-fit">
                RescueOps++
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground">
            <p>
              The project is built for the moment after a service breaks: instead of only paging a
              human, it gathers context, traces the likely root cause, checks the blast radius, and
              moves the fix through verification.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-background/50 p-3">
                <div className="font-medium text-foreground">Input</div>
                <p className="mt-1 text-xs leading-5">Broken commit, failing test, or external alert.</p>
              </div>
              <div className="rounded-lg border bg-background/50 p-3">
                <div className="font-medium text-foreground">Agent work</div>
                <p className="mt-1 text-xs leading-5">Diagnose, patch, verify, and apply policy.</p>
              </div>
              <div className="rounded-lg border bg-background/50 p-3">
                <div className="font-medium text-foreground">Output</div>
                <p className="mt-1 text-xs leading-5">A verified PR or a clear approval request.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-warning/30 bg-warning/10">
          <CardContent className="flex h-full flex-col justify-between gap-5 p-5">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-warning">
                <AlertTriangle className="size-4" />
                Why it matters
              </div>
              <p className="mt-3 text-2xl font-semibold leading-8 text-foreground">
                Incidents waste time when the team has to rediscover the same context every time.
              </p>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              PagerZero keeps the incident, code graph, tests, memory, and shipping decision in one
              flow so the response is faster and easier to audit.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {responseLoop.map((step) => (
          <Card key={step.title}>
            <CardContent className="p-5">
              <step.icon className="size-5 text-primary" />
              <h2 className="mt-4 text-base font-semibold">{step.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.copy}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 className="text-lg font-semibold">The main parts</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Each service has one job, which keeps the demo understandable and makes it clear where
            data moves during an incident.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {pieces.map((piece) => (
            <div key={piece.name} className="rounded-lg border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium">
                <piece.icon className="size-4 text-muted-foreground" />
                {piece.name}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{piece.role}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
