'use client';

import * as React from 'react';
import { CheckCircle2, ExternalLink, FileCode2, GitBranch, RefreshCcw, ScrollText, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  type Incident,
  severityStyles,
  statusLabels,
} from '@/lib/mock-data';
import { formatDuration, timeAgo } from '@/lib/utils';

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

async function responderPost(
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: ResponderPayload }> {
  const headers: Record<string, string> = body !== undefined ? { 'Content-Type': 'application/json' } : {};
  const res = await fetch(path, {
    method: 'POST',
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as ResponderPayload;
  return { ok: res.ok, status: res.status, data };
}

function responseMessage(path: string, status: number, data: ResponderPayload): string {
  const raw =
    data.message ??
    data.error ??
    (data.reasons?.length ? data.reasons.join(', ') : `${path} returned HTTP ${status}`);

  if (/bearer token required|sign in first|service_auth_unavailable|service_password|sign in or set/i.test(raw)) {
    return 'Shipping is unavailable in this view right now. Use Incident chain or configure the responder service account.';
  }
  return raw;
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
      const apply = await responderPost('/responder/apply');
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

      const decision = await responderPost(`/responder/approvals/${encodeURIComponent(approvalId)}`, {
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

  if (!incident) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 grid w-[min(95vw,42rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-card p-6 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground opacity-70 transition-opacity hover:bg-accent hover:opacity-100"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
        >
          <X className="size-4" />
        </button>

        <div className="flex flex-col space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-lg font-semibold leading-none">{incident.id}</h2>
            <Badge className={severityStyles[incident.severity].className} variant="outline">
              {severityStyles[incident.severity].label}
            </Badge>
            <Badge variant="muted">{statusLabels[incident.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Detected{' '}
            <time dateTime={incident.createdAt} suppressHydrationWarning>
              {timeAgo(incident.createdAt)}
            </time>{' '}
            · source {incident.source}
          </p>
        </div>

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

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
        </div>
      </div>
    </div>
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
