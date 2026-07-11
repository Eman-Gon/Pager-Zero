import { ArrowRight, BadgeCheck, BrainCircuit, GitPullRequest, Network, ShieldCheck, Siren } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const dependencies = [
  { label: 'sensor', detail: 'watches the repo' },
  { label: 'neo4j', detail: 'stores the code graph' },
  { label: 'graph 26n', detail: '26 code/runbook nodes' },
  { label: 'llm', detail: 'reasons over context' },
  { label: 'butterbase', detail: 'persists incident state' },
];

const graphLegend = [
  { label: 'Pink', detail: 'root cause: computeTax', className: 'bg-rose-500' },
  { label: 'Yellow', detail: 'blast radius: invoiceTotal, renderInvoice', className: 'bg-amber-400' },
  { label: 'Blue', detail: 'failing or related tests', className: 'bg-blue-400' },
  { label: 'White', detail: 'other nearby functions', className: 'bg-slate-100' },
];

const workflow = [
  {
    icon: Siren,
    title: 'Detect',
    system: 'Sensor + Neo4j',
    summary: 'PagerZero confirms the repo is broken and maps the affected code.',
    facts: ['Status: incident detected', 'Root cause: computeTax', 'Failing tests: format, tax, total'],
  },
  {
    icon: BrainCircuit,
    title: 'Diagnose',
    system: 'LLM + runbooks',
    summary: 'The responder reasons over tests, graph edges, changed functions, and runbook memory.',
    facts: ['Finds the likely cause', 'Explains why downstream code broke', 'Produces a candidate fix'],
  },
  {
    icon: ShieldCheck,
    title: 'Verify',
    system: 'Daytona sandbox',
    summary: 'The candidate patch runs in isolation before it can ship.',
    facts: ['Applies patch in a sandbox', 'Runs Vitest', 'Confirms 4 files and 6 tests pass'],
  },
  {
    icon: GitPullRequest,
    title: 'Ship',
    system: 'GitHub gate',
    summary: 'A verified fix waits for approval or opens a pull request when policy allows.',
    facts: ['Spends apply credit', 'Creates approval if risky', 'Opens PR after the gate clears'],
  },
];

export function MissionWorkflowExplainer() {
  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
              Incident
            </Badge>
            <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
              Plan unlimited
            </Badge>
            <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
              Apply credits ∞
            </Badge>
          </div>
          <CardTitle>Mission workflow for INC-2041</CardTitle>
          <CardDescription>
            PagerZero detected a broken `computeTax` change, traced the blast radius to `invoiceTotal`
            and `renderInvoice`, verified a fix in Daytona, and is waiting at the GitHub shipping gate.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Network className="size-4 text-primary" />
              Top bar signals
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {dependencies.map((dependency) => (
                <div key={dependency.label} className="rounded-md border border-border/70 bg-background/60 p-3">
                  <div className="font-mono text-xs font-semibold text-success">{dependency.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{dependency.detail}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <BadgeCheck className="size-4 text-primary" />
              Code graph legend
            </div>
            <div className="space-y-2">
              {graphLegend.map((item) => (
                <div key={item.label} className="flex items-center gap-3 rounded-md border border-border/70 bg-background/60 p-3">
                  <span className={`size-3 rounded-full ring-2 ring-border ${item.className}`} />
                  <div>
                    <div className="text-xs font-semibold">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 xl:grid-cols-4">
        {workflow.map((step, index) => (
          <Card key={step.title} className="relative overflow-hidden">
            {index < workflow.length - 1 && (
              <ArrowRight className="absolute right-3 top-4 hidden size-4 text-muted-foreground/50 xl:block" />
            )}
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                  <step.icon className="size-4" />
                </div>
                <div>
                  <CardTitle className="text-base">{step.title}</CardTitle>
                  <CardDescription>{step.system}</CardDescription>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{step.summary}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {step.facts.map((fact) => (
                  <li key={fact} className="flex gap-2">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
