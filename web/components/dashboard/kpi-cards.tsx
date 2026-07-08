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
  },
  {
    label: 'Auto-resolve rate',
    value: `${Math.round(kpis.autoResolveRate * 100)}%`,
    description: 'Share of incidents fixed by the agent path without manual repair.',
    icon: Zap,
    delta: '+6pt vs. last wk',
    trend: 'up',
    good: true,
  },
  {
    label: 'Median MTTR',
    value: formatDuration(kpis.medianMttrSeconds),
    description: 'Typical time from detected incident to restored service.',
    icon: Clock,
    delta: '−18% vs. last wk',
    trend: 'down',
    good: true,
  },
  {
    label: 'PRs shipped (7d)',
    value: formatNumber(kpis.prsShippedWeek),
    description: 'Fix pull requests produced in the last seven days.',
    icon: GitPullRequest,
    delta: '+4 vs. last wk',
    trend: 'up',
    good: true,
  },
];

export function KpiCards() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((k) => {
        const TrendIcon = k.trend === 'up' ? ArrowUpRight : ArrowDownRight;
        return (
          <Card key={k.label} className="hover:border-ring/30">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{k.label}</span>
                <k.icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{k.value}</div>
              <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{k.description}</p>
              <div
                className={cn(
                  'mt-1 flex items-center gap-1 text-xs',
                  k.good ? 'text-success' : 'text-destructive',
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
