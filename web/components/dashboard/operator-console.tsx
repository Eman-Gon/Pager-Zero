'use client';

import * as React from 'react';
import { Activity, CheckCircle2, GitPullRequest, Play, RefreshCcw, Siren } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface RepoOption {
  id: string;
  label: string;
  path: string;
  active: boolean;
}

interface IncidentPayload {
  status?: string;
  root_cause?: string | null;
  changed_function_count?: number;
  blast_radius_count?: number;
  failing_tests?: string[];
}

interface HealthPayload {
  sensor?: boolean;
  neo4j?: boolean;
  butterbase?: boolean;
  llm?: { configured?: boolean; provider?: string; model?: string };
}

type ActionKey = 'detect' | 'diagnose' | 'verify' | 'apply';

const ACCESS_TOKEN_KEY = 'rescueops_access_token';
const LAST_APPROVAL_ID_KEY = 'rescueops_last_approval_id';

const ACTIONS: {
  key: ActionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  method: 'GET' | 'POST';
  path: string;
  tone: string;
  iconTone: string;
}[] = [
  {
    key: 'detect',
    label: 'Detect',
    icon: Siren,
    method: 'GET',
    path: '/sensor/incident',
    tone: 'border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-200',
    iconTone: 'text-rose-600 dark:text-rose-300',
  },
  {
    key: 'diagnose',
    label: 'Diagnose',
    icon: Activity,
    method: 'POST',
    path: '/responder/diagnose',
    tone: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/15 dark:text-cyan-200',
    iconTone: 'text-cyan-600 dark:text-cyan-300',
  },
  {
    key: 'verify',
    label: 'Verify',
    icon: CheckCircle2,
    method: 'POST',
    path: '/responder/remediate',
    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-200',
    iconTone: 'text-emerald-600 dark:text-emerald-300',
  },
  {
    key: 'apply',
    label: 'Ship',
    icon: GitPullRequest,
    method: 'POST',
    path: '/responder/apply',
    tone: 'border-violet-500/30 bg-violet-500/10 text-violet-700 hover:bg-violet-500/15 dark:text-violet-200',
    iconTone: 'text-violet-600 dark:text-violet-300',
  },
];

function summarize(path: string, status: number, body: unknown): string {
  if (!body || typeof body !== 'object') return `${path} returned HTTP ${status}`;
  const payload = body as {
    status?: string;
    error?: string;
    message?: string;
    diagnosis?: { severity?: string; root_cause_explanation?: string };
    verified?: boolean;
    pr_url?: string;
    approval_id?: string;
  };
  if (payload.error || payload.message) return payload.message ?? payload.error ?? `HTTP ${status}`;
  if (payload.diagnosis) {
    return `Diagnosis ${payload.diagnosis.severity ?? 'ready'}: ${payload.diagnosis.root_cause_explanation ?? 'trace returned'}`;
  }
  if (typeof payload.verified === 'boolean') return payload.verified ? 'Candidate fix verified.' : 'No verified fix yet.';
  if (payload.pr_url) return `Pull request opened: ${payload.pr_url}`;
  if (payload.approval_id) return `Approval required: ${payload.approval_id}`;
  if (payload.status) return `Status: ${payload.status}`;
  return `${path} returned HTTP ${status}`;
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

export function OperatorConsole({ compact = false }: { compact?: boolean }) {
  const [repos, setRepos] = React.useState<RepoOption[]>([]);
  const [repoId, setRepoId] = React.useState('');
  const [health, setHealth] = React.useState<HealthPayload | null>(null);
  const [token, setToken] = React.useState('');
  const [incident, setIncident] = React.useState<IncidentPayload | null>(null);
  const [busy, setBusy] = React.useState<ActionKey | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const activeRepo = repos.find((repo) => repo.id === repoId) ?? repos.find((repo) => repo.active) ?? repos[0];
  const patientRepos = repos.filter((repo) => repo.id !== 'target-repo');
  const authReady = Boolean(token) && !tokenExpired(token);
  const sensorReady = health?.sensor === true;
  const incidentStats = [
    {
      label: 'Root cause',
      value: incident?.root_cause ?? 'none',
      valueClassName: 'text-rose-700 dark:text-rose-200',
    },
    {
      label: 'Changed functions',
      value: incident?.changed_function_count ?? 0,
      valueClassName: 'text-cyan-700 dark:text-cyan-200',
    },
    {
      label: 'Blast radius',
      value: incident?.blast_radius_count ?? 0,
      valueClassName: 'text-amber-700 dark:text-amber-200',
    },
    {
      label: 'Failing tests',
      value: incident?.failing_tests?.length ?? 0,
      valueClassName: 'text-emerald-700 dark:text-emerald-200',
    },
  ];

  React.useEffect(() => {
    let alive = true;
    fetch('/api/repos', { cache: 'no-store' })
      .then(async (res) => {
        const payload = (await res.json()) as { active: string | null; repos: RepoOption[] };
        if (!alive) return;
        setRepos(payload.repos);
        setRepoId(payload.active ?? payload.repos[0]?.id ?? '');
      })
      .catch(() => {
        if (!alive) return;
        setRepos([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
      if (saved && !tokenExpired(saved)) setToken(saved);
    } catch {
      /* localStorage can be unavailable in private windows. */
    }
  }, []);

  const refreshHealth = React.useCallback(async () => {
    try {
      const res = await fetch('/responder/health', { cache: 'no-store' });
      const payload = (await res.json()) as HealthPayload;
      setHealth(payload);
      return payload;
    } catch {
      setHealth({ sensor: false, neo4j: false, butterbase: false, llm: { configured: false } });
      return null;
    }
  }, []);

  const run = React.useCallback(
    async (action: (typeof ACTIONS)[number]) => {
      setBusy(action.key);
      setError(null);
      setMessage(null);
      try {
        const latestHealth = await refreshHealth();
        if (action.key === 'detect' && latestHealth?.sensor === false) {
          throw new Error('Sensor backend is offline. Start the sensor on :3003, then run Detect again.');
        }
        if (action.key !== 'detect' && !authReady) {
          throw new Error('Diagnose, Verify, and Ship need a signed-in Bearer token.');
        }
        const res = await fetch(action.path, {
          method: action.method,
          headers: action.key !== 'detect' ? { Authorization: `Bearer ${token}` } : undefined,
          cache: 'no-store',
        });
        const body = await res.json().catch(() => null);
        if (action.key === 'detect' && body && typeof body === 'object') setIncident(body as IncidentPayload);
        if (action.key === 'apply' && body && typeof body === 'object') {
          const approvalId = (body as { approval_id?: unknown }).approval_id;
          const prUrl = (body as { pr_url?: unknown }).pr_url;
          try {
            if (typeof approvalId === 'string' && approvalId) {
              localStorage.setItem(LAST_APPROVAL_ID_KEY, approvalId);
            } else if (typeof prUrl === 'string' && prUrl) {
              localStorage.removeItem(LAST_APPROVAL_ID_KEY);
            }
          } catch {
            /* localStorage can be unavailable in private windows. */
          }
        }
        if (!res.ok) throw new Error(summarize(action.path, res.status, body));
        setMessage(summarize(action.path, res.status, body));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [authReady, refreshHealth, token],
  );

  React.useEffect(() => {
    void refreshHealth();
    const detect = ACTIONS[0];
    void run(detect);
  }, [refreshHealth, run]);

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader className={cn('bg-primary/5', compact && 'p-4')}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-3 text-base">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <Play className="size-4" />
              </span>
              Operations
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl leading-6">
              Run the response flow against the selected repository.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              'w-fit px-2.5 py-1',
              incident?.status === 'incident' || health?.sensor === false
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-success/25 bg-success/10 text-success',
            )}
          >
            {health?.sensor === false ? 'sensor offline' : incident?.status ?? 'checking'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={cn('grid gap-5', compact && 'gap-4 p-4')}>
        <div className="grid gap-4 xl:grid-cols-[minmax(260px,380px)_1fr]">
          <label className="grid gap-2 rounded-lg border border-border/80 bg-muted/25 p-4 text-sm font-medium">
            <span>Active sensor target</span>
            <select
              value={repoId}
              onChange={(event) => setRepoId(event.target.value)}
              className="h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              {activeRepo ? (
                <option value={activeRepo.id}>
                  {activeRepo.label} · {activeRepo.path}
                </option>
              ) : (
                <option value="">No repositories found</option>
              )}
            </select>
            <span className="text-xs leading-5 text-muted-foreground">
              Sensor scans `target-repo`; patient repos must be loaded before sensor startup.
            </span>
          </label>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {ACTIONS.map((action) => (
              <Button
                key={action.key}
                type="button"
                variant="outline"
                className={cn('h-11 justify-start gap-2 rounded-lg border px-3 shadow-sm', action.tone)}
                onClick={() => run(action)}
                disabled={busy !== null || !activeRepo || (action.key === 'detect' ? sensorReady === false : !authReady)}
              >
                {busy === action.key ? (
                  <RefreshCcw className={cn('size-4 animate-spin', action.iconTone)} />
                ) : (
                  <action.icon className={cn('size-4', action.iconTone)} />
                )}
                {action.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 rounded-lg border border-border/80 bg-muted/20 p-4 text-sm lg:grid-cols-[1fr_1fr]">
          <label className="grid gap-2 text-sm font-medium">
            <span>Bearer token</span>
            <input
              value={token}
              onChange={(event) => {
                const nextToken = event.target.value.trim();
                setToken(nextToken);
                try {
                  if (nextToken) localStorage.setItem(ACCESS_TOKEN_KEY, nextToken);
                  else localStorage.removeItem(ACCESS_TOKEN_KEY);
                } catch {
                  /* localStorage can be unavailable in private windows. */
                }
              }}
              placeholder="Paste a signed-in access token for Diagnose / Verify / Ship"
              className="h-11 rounded-lg border border-input bg-card px-3 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="rounded-lg border border-border/70 bg-card/60 p-3 text-xs leading-5 text-muted-foreground">
            <div className="font-medium text-foreground">Available patient repos</div>
            <div className="mt-1">
              {patientRepos.length ? patientRepos.map((repo) => repo.id).join(', ') : 'No patient repos found.'}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border/80 bg-muted/20 text-sm">
          <div className="grid sm:grid-cols-2 xl:grid-cols-4">
            {incidentStats.map((stat, index) => (
              <div
                key={stat.label}
                className={cn(
                  'min-w-0 border-border/70 p-4',
                  index === 0 && 'border-b sm:border-r xl:border-b-0',
                  index === 1 && 'border-b xl:border-r xl:border-b-0',
                  index === 2 && 'border-b sm:border-b-0 sm:border-r',
                )}
              >
                <div className="text-xs font-medium text-muted-foreground">{stat.label}</div>
                <div className={cn('mt-2 break-words font-mono text-base font-semibold', stat.valueClassName)}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {(message || error) && (
          <div
            className={cn(
              'break-words rounded-lg border px-4 py-3 text-sm leading-6',
              error
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-success/25 bg-success/10 text-success',
            )}
          >
            {error ?? message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
