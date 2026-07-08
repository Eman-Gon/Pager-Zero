import { ArrowDownRight, ArrowUpRight, Clock, GitPullRequest, Siren, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { formatDuration, formatNumber } from '@/lib/utils';
import { kpis } from '@/lib/mock-data';

interface Kpi {
  label: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  delta: string;
  trend: 'up' | 'down';
  good: boolean;
  tone: {
    border: string;
    stripe: string;
    icon: string;
    delta: string;
  };
}

const cards: Kpi[] = [
  {
    label: 'Open incidents',
    value: formatNumber(kpis.openIncidents),
    description: 'Problems still being diagnosed, verified, or approved.',
    icon: Siren,
    delta: '2 triaging',
    trend: 'down',
    good: true,
    tone: {
      border: 'border-rose-500/25 hover:border-rose-500/45',
      stripe: 'bg-rose-500',
      icon: 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-200',
      delta: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    },
  },
  {
    label: 'Auto-resolve rate',
    value: `${Math.round(kpis.autoResolveRate * 100)}%`,
    description: 'Share of incidents fixed by the agent path without manual repair.',
    icon: Zap,
    delta: '+6pt vs. last wk',
    trend: 'up',
    good: true,
    tone: {
      border: 'border-cyan-500/25 hover:border-cyan-500/45',
      stripe: 'bg-cyan-500',
      icon: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-200',
      delta: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    },
  },
  {
    label: 'Median MTTR',
    value: formatDuration(kpis.medianMttrSeconds),
    description: 'Typical time from detected incident to restored service.',
    icon: Clock,
    delta: '−18% vs. last wk',
    trend: 'down',
    good: true,
    tone: {
      border: 'border-amber-500/25 hover:border-amber-500/45',
      stripe: 'bg-amber-500',
      icon: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-200',
      delta: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    },
  },
  {
    label: 'PRs shipped (7d)',
    value: formatNumber(kpis.prsShippedWeek),
    description: 'Fix pull requests produced in the last seven days.',
    icon: GitPullRequest,
    delta: '+4 vs. last wk',
    trend: 'up',
    good: true,
    tone: {
      border: 'border-violet-500/25 hover:border-violet-500/45',
      stripe: 'bg-violet-500',
      icon: 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-200',
      delta: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    },
  },
];

export function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((k) => {
        const TrendIcon = k.trend === 'up' ? ArrowUpRight : ArrowDownRight;
        return (
          <Card key={k.label} className={cn('relative overflow-hidden', k.tone.border)}>
            <span className={cn('absolute inset-x-0 top-0 h-1', k.tone.stripe)} />
            <CardContent className="p-5 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{k.label}</span>
                <span className={cn('grid size-9 place-items-center rounded-lg border', k.tone.icon)}>
                  <k.icon className="size-4" />
                </span>
              </div>
              <div className="mt-3 text-3xl font-semibold tabular-nums">{k.value}</div>
              <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{k.description}</p>
              <div
                className={cn(
                  'mt-3 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium',
                  k.good ? k.tone.delta : 'border-destructive/25 bg-destructive/10 text-destructive',
                )}
              >
                <TrendIcon className="size-3.5" />
                {k.delta}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
