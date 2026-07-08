'use client';

import * as React from 'react';
import { ChevronRight, Siren } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/utils';
import {
  type Incident,
  incidents,
  severityStyles,
  statusLabels,
} from '@/lib/mock-data';
import { IncidentDetailDialog } from '@/components/dashboard/incident-detail-dialog';

const SOURCE_LABEL: Record<Incident['source'], string> = {
  sensor: 'Sensor',
  pagerduty: 'PagerDuty',
  sentry: 'Sentry',
};

const STATUS_TONE: Record<Incident['status'], string> = {
  diagnosing: 'text-muted-foreground',
  verifying: 'text-warning',
  pending_approval: 'text-destructive',
  shipped: 'text-success',
  resolved: 'text-muted-foreground',
};

export function IncidentTable() {
  const [selected, setSelected] = React.useState<Incident | null>(null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Siren className="size-4" /> Incident queue
          </CardTitle>
          <CardDescription>
            Live triage across sensor, PagerDuty, and Sentry. Root cause is the suspected broken
            function; status shows where the agent is in the response flow.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y text-left text-xs uppercase text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium" title="Tracking ID for this problem.">Incident</th>
                  <th className="px-3 py-2.5 font-medium" title="Function the agent thinks caused the break.">Root cause</th>
                  <th className="px-3 py-2.5 font-medium" title="Business impact estimate.">Severity</th>
                  <th className="px-3 py-2.5 font-medium" title="Current step: diagnose, verify, approve, ship, or resolve.">Status</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell" title="Where the signal came from.">Source</th>
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell" title="How long ago the incident appeared.">Age</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr
                    key={i.id}
                    onClick={() => setSelected(i)}
                    className="group cursor-pointer border-b transition-colors last:border-0 hover:bg-accent/50"
                  >
                    <td className="whitespace-nowrap px-5 py-3 font-mono font-medium">{i.id}</td>
                    <td className="px-3 py-3">
                      <span className="font-mono">{i.rootCause}</span>
                      <span className="hidden text-muted-foreground sm:inline"> · {i.file}</span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={severityStyles[i.severity].className}>
                        <span className={cn('size-1.5 rounded-full', severityStyles[i.severity].dot)} />
                        {severityStyles[i.severity].label}
                      </Badge>
                    </td>
                    <td className={cn('whitespace-nowrap px-3 py-3 font-medium', STATUS_TONE[i.status])}>
                      {statusLabels[i.status]}
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                      {SOURCE_LABEL[i.source]}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-muted-foreground lg:table-cell">
                      {timeAgo(i.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ChevronRight className="ml-auto size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <IncidentDetailDialog incident={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </>
  );
}
