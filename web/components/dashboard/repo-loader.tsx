'use client';

import * as React from 'react';
import { FolderGit2, RefreshCcw, RotateCcw, Siren } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface RepoOption {
  id: string;
  label: string;
  path: string;
  active: boolean;
}

export function RepoLoader() {
  const [repos, setRepos] = React.useState<RepoOption[]>([]);
  const [repoId, setRepoId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [demoBusy, setDemoBusy] = React.useState<'break' | 'reset' | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const anyBusy = busy || demoBusy !== null;

  const loadRepoList = React.useCallback(async () => {
    try {
      const res = await fetch('/api/repos', { cache: 'no-store' });
      const payload = (await res.json()) as { active: string | null; repos: RepoOption[] };
      // target-repo is the destination the sensor scans, not a loadable patient.
      const patients = (payload.repos ?? []).filter((repo) => repo.id !== 'target-repo');
      setRepos(patients);
      setRepoId((prev) => prev || patients[0]?.id || '');
    } catch {
      setError('Could not load the repo list.');
    }
  }, []);

  React.useEffect(() => {
    void loadRepoList();
  }, [loadRepoList]);

  const loadRepo = React.useCallback(async () => {
    if (!repoId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/repos/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repoId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { status?: string; note?: string; error?: string }
        | null;
      if (!res.ok || !body || body.error) {
        throw new Error(body?.error ?? `Load failed (HTTP ${res.status}).`);
      }
      setMessage(`Loaded '${repoId}' (clean baseline). Now click "Break production" to arm the bug, then run the chain.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [repoId]);

  // Break / Restore drive the sensor's demo controls, then poll /sensor/incident
  // so the button confirms the sensor has actually picked up the new state.
  const runDemo = React.useCallback(async (action: 'break' | 'reset') => {
    setDemoBusy(action);
    setError(null);
    setMessage(null);
    try {
      const path = action === 'break' ? '/sensor/demo/break' : '/sensor/demo/reset';
      const res = await fetch(path, { method: 'POST' });
      const body = (await res.json().catch(() => null)) as
        | { status?: string; file?: string; error?: string }
        | null;
      if (!res.ok || !body || body.error) {
        throw new Error(body?.error ?? `${action === 'break' ? 'Break' : 'Restore'} failed (HTTP ${res.status}).`);
      }
      const want = action === 'break' ? 'incident' : 'ok';
      let confirmed = false;
      for (let i = 0; i < 8; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const inc = await fetch('/sensor/incident', { cache: 'no-store' });
          const j = (await inc.json()) as { status?: string };
          if (j.status === want) {
            confirmed = true;
            break;
          }
        } catch {
          /* keep polling */
        }
      }
      if (action === 'break') {
        setMessage(
          confirmed
            ? 'Production broken — incident armed. Run the full chain (or Detect) below.'
            : 'Break sent — the sensor is rescanning; give Detect a couple of seconds.',
        );
      } else {
        setMessage(
          confirmed
            ? 'Restored to the clean baseline (no incident).'
            : 'Restore sent — the sensor is rescanning.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDemoBusy(null);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderGit2 className="size-4" /> Target repo
        </CardTitle>
        <CardDescription>
          Load a patient repo into <code>target-repo</code> and rebuild the sensor&apos;s code graph, then arm
          the bug and run the chain below against it.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-medium">
          <span>Repo to load</span>
          <select
            value={repoId}
            onChange={(event) => setRepoId(event.target.value)}
            disabled={anyBusy || repos.length === 0}
            className="h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          >
            {repos.length ? (
              repos.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.label} · {repo.path}
                </option>
              ))
            ) : (
              <option value="">No patient repos found</option>
            )}
          </select>
        </label>
        <Button type="button" onClick={() => void loadRepo()} disabled={anyBusy || !repoId}>
          {busy ? <RefreshCcw className="animate-spin" /> : null}
          {busy ? 'Loading…' : 'Load repo'}
        </Button>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button
            type="button"
            variant="outline"
            className={cn(
              'gap-2 border-rose-500/30 bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-200',
            )}
            onClick={() => void runDemo('break')}
            disabled={anyBusy}
          >
            {demoBusy === 'break' ? <RefreshCcw className="size-4 animate-spin" /> : <Siren className="size-4" />}
            Break production
          </Button>
          <Button type="button" variant="outline" className="gap-2" onClick={() => void runDemo('reset')} disabled={anyBusy}>
            {demoBusy === 'reset' ? <RefreshCcw className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Restore
          </Button>
          <span className="text-xs leading-5 text-muted-foreground">
            Loading gives a clean repo — <strong>Break</strong> arms the bug before you run the chain.
          </span>
        </div>

        {(message || error) && (
          <div
            className={cn(
              'break-words rounded-lg border px-4 py-3 text-sm leading-6 sm:col-span-2',
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
