'use client';

import { CheckCircle2, ExternalLink, FileCode2, GitBranch, ScrollText } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  type Incident,
  severityStyles,
  statusLabels,
} from '@/lib/mock-data';
import { formatDuration, timeAgo } from '@/lib/utils';

export function IncidentDetailDialog({
  incident,
  onOpenChange,
}: {
  incident: Incident | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!incident} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        {incident && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle className="font-mono">{incident.id}</DialogTitle>
                <Badge className={severityStyles[incident.severity].className} variant="outline">
                  {severityStyles[incident.severity].label}
                </Badge>
                <Badge variant="muted">{statusLabels[incident.status]}</Badge>
              </div>
              <DialogDescription>
                Detected {timeAgo(incident.createdAt)} · source {incident.source}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <Field icon={FileCode2} label="Root cause">
                <span className="font-mono font-medium">{incident.rootCause}</span>
                <span className="text-muted-foreground"> in {incident.file}</span>
              </Field>

              <Field icon={GitBranch} label="Blast radius">
                <div className="flex flex-wrap gap-1.5">
                  {incident.blastRadius.map((fn) => (
                    <Badge key={fn} variant="secondary" className="font-mono">
                      {fn}
                    </Badge>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {incident.failingTests} failing test{incident.failingTests === 1 ? '' : 's'} across the callgraph.
                </p>
              </Field>

              {incident.citedRunbook && (
                <Field icon={ScrollText} label="Cited runbook">
                  <span className="italic text-muted-foreground">“{incident.citedRunbook}”</span>
                </Field>
              )}

              {incident.mttrSeconds != null && (
                <Field icon={CheckCircle2} label="Time to restore">
                  <span className="font-medium text-success">{formatDuration(incident.mttrSeconds)}</span>
                </Field>
              )}
            </div>

            <Separator />

            <DialogFooter>
              {incident.prUrl ? (
                <Button asChild variant="outline">
                  <a href={incident.prUrl} target="_blank" rel="noreferrer">
                    View PR <ExternalLink />
                  </a>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  PR pending
                </Button>
              )}
              {incident.status === 'pending_approval' ? (
                <Button variant="destructive">Approve &amp; ship</Button>
              ) : (
                <Button disabled={incident.status === 'resolved'}>
                  {incident.status === 'resolved' ? 'Resolved' : 'Following along'}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
