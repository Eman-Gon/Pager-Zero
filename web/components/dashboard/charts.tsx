'use client';

import {
  Area,
  AreaChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { incidentTrend, mttrTrend, severityBreakdown } from '@/lib/mock-data';

const AXIS = { stroke: 'hsl(var(--muted-foreground))', fontSize: 11 };

/** Shared tooltip surface so all three charts read as one system. */
function ChartTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {label && <div className="mb-1 font-medium text-popover-foreground">{label}</div>}
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
          <span className="capitalize">{p.name}</span>
          <span className="ml-auto font-medium tabular-nums text-popover-foreground">
            {p.value}
            {unit ?? ''}
          </span>
        </div>
      ))}
    </div>
  );
}

export function IncidentTrendChart() {
  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Incidents detected vs. auto-shipped</CardTitle>
        <CardDescription>
          Last 14 days. Detected means new problems found; auto-shipped means fixes that reached
          the shipping path.
        </CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={incidentTrend} margin={{ left: -18, right: 4, top: 4 }}>
            <defs>
              <linearGradient id="gDetected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gShipped" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.35} />
                <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tickLine={false} axisLine={false} {...AXIS} interval={1} />
            <YAxis tickLine={false} axisLine={false} width={32} {...AXIS} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'hsl(var(--border))' }} />
            <Area
              type="monotone"
              dataKey="detected"
              name="Detected"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              fill="url(#gDetected)"
            />
            <Area
              type="monotone"
              dataKey="autoShipped"
              name="Auto-shipped"
              stroke="hsl(var(--success))"
              strokeWidth={2}
              fill="url(#gShipped)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function MttrChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mean time to restore</CardTitle>
        <CardDescription>
          Weekly median, in minutes. Lower MTTR means the system is restoring service faster.
        </CardDescription>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={mttrTrend} margin={{ left: -18, right: 8, top: 4 }}>
            <XAxis dataKey="week" tickLine={false} axisLine={false} {...AXIS} />
            <YAxis tickLine={false} axisLine={false} width={32} {...AXIS} />
            <Tooltip content={<ChartTooltip unit="m" />} cursor={{ stroke: 'hsl(var(--border))' }} />
            <Line
              type="monotone"
              dataKey="mttr"
              name="MTTR"
              stroke="hsl(var(--foreground))"
              strokeWidth={2}
              dot={{ r: 2.5, fill: 'hsl(var(--foreground))' }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

const SEV_FILL: Record<string, string> = {
  high: 'hsl(var(--destructive))',
  medium: 'hsl(var(--warning))',
  low: 'hsl(var(--success))',
};

export function SeverityChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Severity mix</CardTitle>
        <CardDescription>
          Resolved this quarter. Severity estimates how much user or business impact an incident had.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex h-64 items-center">
        <ResponsiveContainer width="60%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie
              data={severityBreakdown}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={78}
              paddingAngle={2}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {severityBreakdown.map((s) => (
                <Cell key={s.key} fill={SEV_FILL[s.key]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <ul className="flex-1 space-y-2 text-sm">
          {severityBreakdown.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: SEV_FILL[s.key] }} />
              <span className="text-muted-foreground">{s.name}</span>
              <span className="ml-auto font-medium tabular-nums">{s.value}%</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
