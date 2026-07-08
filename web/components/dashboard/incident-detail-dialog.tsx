'use client';

import * as React from 'react';
import { CheckCircle2, ExternalLink, FileCode2, GitBranch, RefreshCcw, ScrollText } from 'lucide-react';
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

const ACCESS_TOKEN_KEY = 'rescueops_access_token';
const LAST_APPROVAL_ID_KEY = 'rescueops_last_approval_id';

interface ResponderPayload {
  status?: string;
  error?: string;
  message?: string;
  pr_url?: string;
  approval_id?: string;
  mttr_seconds?: number;
  reasons?: string[];
}

interface ShipOutcome {
  label: string;
  prUrl?: string;
  mttrSeconds?: number;
}

function tokenExpired(token: string, skewSeconds = 30): boolean {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(b64)) as { exp?: number };
    return typeof exp === 'number' && exp * 1000 <= Date.now() + skewSeconds * 1000;
  } catch {
    return false;
  }
}

async function responderPost(
  path: string,
  token: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: ResponderPayload }> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as ResponderPayload;
  return { ok: res.ok, status: res.status, data };
}

function responseMessage(path: string, status: number, data: ResponderPayload): string {
  if (data.message) return data.message;
  if (data.error) return data.error;
  if (data.reasons?.length) return data.reasons.join(', ');
  return `${path} returned HTTP ${status}`;
}

export function IncidentDetailDialog({
  incident,
  onOpenChange,
}: {
  incident: Incident | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [shipError, setShipError] = React.useState<string | null>(null);
  const [shipOutcome, setShipOutcome] = React.useState<ShipOutcome | null>(null);

  React.useEffect(() => {
    setBusy(false);
    setShipError(null);
    setShipOutcome(null);
  }, [incident?.id]);

  async function approveAndShip() {
    setBusy(true);
    setShipError(null);
    setShipOutcome(null);

    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY)?.trim();
      if (!token) {
        throw new Error('Paste a signed-in Bearer token in Operations, then retry.');
      }
      if (tokenExpired(token)) {
        throw new Error('The saved Bearer token is expired. Paste a fresh token in Operations.');
      }

      const apply = await responderPost('/responder/apply', token);
      if (apply.ok && apply.data.pr_url) {
        localStorage.removeItem(LAST_APPROVAL_ID_KEY);
        setShipOutcome({
          label: 'Pull request opened',
          prUrl: apply.data.pr_url,
          mttrSeconds: apply.data.mttr_seconds,
        });
        return;
      }

      const approvalId = apply.data.approval_id ?? localStorage.getItem(LAST_APPROVAL_ID_KEY) ?? '';
      if (!approvalId) {
        throw new Error(responseMessage('/responder/apply', apply.status, apply.data));
      }
      localStorage.setItem(LAST_APPROVAL_ID_KEY, approvalId);

      const decision = await responderPost(`/responder/approvals/${encodeURIComponent(approvalId)}`, token, {
        decision: 'approved',
      });
      if (!decision.ok) {
        if (decision.status === 409 && decision.data.error === 'already_applied') {
          localStorage.removeItem(LAST_APPROVAL_ID_KEY);
          setShipOutcome({ label: decision.data.message ?? 'This fix was already shipped' });
          return;
        }
        throw new Error(responseMessage(`/responder/approvals/${approvalId}`, decision.status, decision.data));
      }

      localStorage.removeItem(LAST_APPROVAL_ID_KEY);
      setShipOutcome({
        label: decision.data.pr_url ? 'Pull request opened' : decision.data.status ?? 'Approved',
        prUrl: decision.data.pr_url,
        mttrSeconds: decision.data.mttr_seconds,
      });
    } catch (err) {
      setShipError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

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
              <Field
                icon={FileCode2}
                label="Root cause"
                hint="The function the agent believes introduced or exposed the break."
              >
                <span className="font-mono font-medium">{incident.rootCause}</span>
                <span className="text-muted-foreground"> in {incident.file}</span>
              </Field>

              <Field
                icon={GitBranch}
                label="Blast radius"
                hint="Functions or workflows that call into the root cause and may be affected."
              >
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
                <Field
                  icon={ScrollText}
                  label="Cited runbook"
                  hint="A stored fix pattern the agent used as context for this diagnosis."
                >
                  <span className="italic text-muted-foreground">“{incident.citedRunbook}”</span>
                </Field>
              )}

              {incident.mttrSeconds != null && (
                <Field
                  icon={CheckCircle2}
                  label="Time to restore"
                  hint="How long it took from detection to a restored or shipped state."
                >
                  <span className="font-medium text-success">{formatDuration(incident.mttrSeconds)}</span>
                </Field>
              )}
            </div>

            {(shipError || shipOutcome) && (
              <div
                className={
                  shipError
                    ? 'rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
                    : 'rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm text-success'
                }
              >
                {shipError ?? shipOutcome?.label}
                {shipOutcome?.prUrl && (
                  <>
                    {' '}
                    <a
                      className="font-medium underline underline-offset-4"
                      href={shipOutcome.prUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View PR
                    </a>
                  </>
                )}
                {shipOutcome?.mttrSeconds != null && (
                  <span className="text-muted-foreground"> · MTTR {formatDuration(shipOutcome.mttrSeconds)}</span>
                )}
              </div>
            )}

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
                <Button variant="destructive" onClick={approveAndShip} disabled={busy || !!shipOutcome?.prUrl}>
                  {busy && <RefreshCcw className="animate-spin" />}
                  {busy ? 'Approving...' : 'Approve & ship'}
                </Button>
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
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
        {hint && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>}
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
