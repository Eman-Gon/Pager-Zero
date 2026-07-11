'use client';

import * as React from 'react';
import { ArrowRight, CheckCircle2, GitBranch, Play, RefreshCcw, ShipWheel, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StepKey = 'detect' | 'diagnose' | 'graphBefore' | 'verify' | 'graphAfter' | 'ship';
type StepState = 'idle' | 'running' | 'done' | 'error';

interface IncidentPayload {
  status?: string;
  root_cause?: string | null;
  failing_tests?: string[];
  blast_radius?: string[];
}

interface DiagnosePayload {
  status?: string;
  diagnosis?: {
    severity?: string;
    root_cause_explanation?: string;
    proposed_fix_approach?: string;
    cited_runbook?: string | null;
  };
  error?: string;
  message?: string;
}

interface RemediatePayload {
  verified?: boolean;
  candidate_fix?: { path?: string; content?: string } | null;
  test_output?: string;
  error?: string;
  message?: string;
}

interface ApplyPayload {
  status?: string;
  approval_id?: string;
  pr_url?: string;
  mttr_seconds?: number;
  error?: string;
  message?: string;
}

interface Neo4jPayload {
  total: number;
  labels: { label: string; count: number }[];
  nodes: {
    elementId: string;
    display: string;
    labels: string[];
    incoming: number;
    outgoing: number;
  }[];
  error?: string;
}

interface GraphSnapshot {
  capturedAt: string;
  total: number;
  labelCount: number;
  topFunctions: { name: string; incoming: number; outgoing: number }[];
}

const STEP_ORDER: StepKey[] = ['detect', 'diagnose', 'graphBefore', 'verify', 'graphAfter', 'ship'];

const STEP_TEXT: Record<StepKey, { title: string; desc: string }> = {
  detect: { title: '1. Detect', desc: 'Read the sensor incident and confirm root cause, blast radius, and failing tests.' },
  diagnose: { title: '2. Diagnose', desc: 'Use the LLM, graph context, changed functions, and runbooks to propose a fix.' },
  graphBefore: { title: 'Graph before fix', desc: 'Snapshot Function nodes before the repair runs.' },
  verify: { title: '3. Verify', desc: 'Apply the candidate patch inside a Daytona sandbox and run the real tests.' },
  graphAfter: { title: 'Graph after verify', desc: 'Capture the graph again after the verified candidate is persisted.' },
  ship: { title: '4. Ship', desc: 'Apply the verified fix, clear approval gates, and open a GitHub PR.' },
};

const INITIAL_STEP_STATE: Record<StepKey, StepState> = {
  detect: 'idle',
  diagnose: 'idle',
  graphBefore: 'idle',
  verify: 'idle',
  graphAfter: 'idle',
  ship: 'idle',
};

const INITIAL_STEP_MSG: Record<StepKey, string> = {
  detect: '',
  diagnose: '',
  graphBefore: '',
  verify: '',
  graphAfter: '',
  ship: '',
};

async function requestJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(path, { cache: 'no-store', ...init });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

function statusTone(state: StepState): string {
  if (state === 'done') return 'border-success/30 bg-success/10 text-success';
  if (state === 'running') return 'border-primary/30 bg-primary/10 text-primary';
  if (state === 'error') return 'border-destructive/30 bg-destructive/10 text-destructive';
  return 'border-border bg-muted text-muted-foreground';
}

export function IncidentChainFlow() {
  const [runningAll, setRunningAll] = React.useState(false);
  const [stepState, setStepState] = React.useState<Record<StepKey, StepState>>(INITIAL_STEP_STATE);
  const [stepMsg, setStepMsg] = React.useState<Record<StepKey, string>>(INITIAL_STEP_MSG);
  const [incident, setIncident] = React.useState<IncidentPayload | null>(null);
  const [diagnose, setDiagnose] = React.useState<DiagnosePayload | null>(null);
  const [remediate, setRemediate] = React.useState<RemediatePayload | null>(null);
  const [ship, setShip] = React.useState<ApplyPayload | null>(null);
  const [graphBefore, setGraphBefore] = React.useState<GraphSnapshot | null>(null);
  const [graphAfter, setGraphAfter] = React.useState<GraphSnapshot | null>(null);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const markStep = React.useCallback((step: StepKey, state: StepState, message = '') => {
    setStepState((prev) => ({ ...prev, [step]: state }));
    if (message) setStepMsg((prev) => ({ ...prev, [step]: message }));
  }, []);

  const captureGraph = React.useCallback(async (): Promise<GraphSnapshot> => {
    const res = await requestJson<Neo4jPayload>('/api/neo4j/nodes?label=Function&limit=24');
    if (!res.ok) {
      const err = (res.data as { error?: string }).error ?? `Graph request failed (${res.status})`;
      throw new Error(err);
    }
    return {
      capturedAt: new Date().toISOString(),
      total: res.data.total,
      labelCount: res.data.labels.length,
      topFunctions: res.data.nodes.slice(0, 8).map((node) => ({
        name: node.display,
        incoming: node.incoming,
        outgoing: node.outgoing,
      })),
    };
  }, []);

  const runDetect = React.useCallback(async (): Promise<boolean> => {
    markStep('detect', 'running');
    try {
      const res = await requestJson<IncidentPayload>('/sensor/incident');
      if (!res.ok) throw new Error(`Detect failed (${res.status})`);
      setIncident(res.data);
      if (res.data.status !== 'incident') {
        markStep('detect', 'error', `Sensor status is "${res.data.status ?? 'unknown'}". Seed an incident first.`);
        return false;
      }
      markStep('detect', 'done', `Root cause: ${res.data.root_cause ?? 'unknown'}`);
      return true;
    } catch (err) {
      markStep('detect', 'error', err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [markStep]);

  const runDiagnose = React.useCallback(async (): Promise<boolean> => {
    markStep('diagnose', 'running');
    try {
      const res = await requestJson<DiagnosePayload>('/responder/diagnose', { method: 'POST' });
      if (!res.ok) {
        throw new Error(
          res.data.message ?? res.data.error ?? `Diagnose failed (${res.status})`,
        );
      }
      setDiagnose(res.data);
      markStep('diagnose', 'done', `Severity: ${res.data.diagnosis?.severity ?? 'unknown'}`);
      return true;
    } catch (err) {
      markStep('diagnose', 'error', err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [markStep]);

  const runGraphBefore = React.useCallback(async (): Promise<boolean> => {
    markStep('graphBefore', 'running');
    try {
      const snapshot = await captureGraph();
      setGraphBefore(snapshot);
      markStep('graphBefore', 'done', `Captured ${snapshot.topFunctions.length} function nodes.`);
      return true;
    } catch (err) {
      markStep('graphBefore', 'error', err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [captureGraph, markStep]);

  const runVerify = React.useCallback(async (): Promise<boolean> => {
    markStep('verify', 'running');
    try {
      const res = await requestJson<RemediatePayload>('/responder/remediate', { method: 'POST' });
      if (!res.ok) {
        throw new Error(
          res.data.message ?? res.data.error ?? `Verify failed (${res.status})`,
        );
      }
      setRemediate(res.data);
      if (!res.data.verified) {
        markStep('verify', 'error', 'Daytona verify did not return a verified fix.');
        return false;
      }
      markStep('verify', 'done', `Verified candidate: ${res.data.candidate_fix?.path ?? 'unknown path'}`);
      return true;
    } catch (err) {
      markStep('verify', 'error', err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [markStep]);

  const runGraphAfter = React.useCallback(async (): Promise<boolean> => {
    markStep('graphAfter', 'running');
    try {
      const snapshot = await captureGraph();
      setGraphAfter(snapshot);
      markStep('graphAfter', 'done', `Captured ${snapshot.topFunctions.length} function nodes.`);
      return true;
    } catch (err) {
      markStep('graphAfter', 'error', err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [captureGraph, markStep]);

  const runShip = React.useCallback(async (): Promise<boolean> => {
    markStep('ship', 'running');
    try {
      const apply = await requestJson<ApplyPayload>('/responder/apply', { method: 'POST' });
      let final = apply;
      if (apply.ok && apply.data.status === 'pending_approval' && apply.data.approval_id) {
        final = await requestJson<ApplyPayload>(
          `/responder/approvals/${encodeURIComponent(apply.data.approval_id)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: 'approved' }),
          },
        );
      }
      if (!final.ok) {
        throw new Error(
          final.data.message ?? final.data.error ?? `Ship failed (${final.status})`,
        );
      }
      setShip(final.data);
      markStep('ship', 'done', final.data.pr_url ? 'PR opened.' : final.data.status ?? 'Ship complete.');
      return true;
    } catch (err) {
      markStep('ship', 'error', err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [markStep]);

  const runStep = React.useCallback(
    async (step: StepKey): Promise<boolean> => {
      setGlobalError(null);
      if (step === 'detect') return runDetect();
      if (step === 'diagnose') return runDiagnose();
      if (step === 'graphBefore') return runGraphBefore();
      if (step === 'verify') return runVerify();
      if (step === 'graphAfter') return runGraphAfter();
      return runShip();
    },
    [runDetect, runDiagnose, runGraphAfter, runGraphBefore, runShip, runVerify],
  );

  const runFullChain = React.useCallback(async () => {
    setRunningAll(true);
    setGlobalError(null);
    try {
      for (const step of STEP_ORDER) {
        const ok = await runStep(step);
        if (!ok) {
          setGlobalError(`Chain stopped at ${STEP_TEXT[step].title}.`);
          break;
        }
      }
    } finally {
      setRunningAll(false);
    }
  }, [runStep]);

  const resetFlow = React.useCallback(() => {
    setRunningAll(false);
    setStepState(INITIAL_STEP_STATE);
    setStepMsg(INITIAL_STEP_MSG);
    setIncident(null);
    setDiagnose(null);
    setRemediate(null);
    setShip(null);
    setGraphBefore(null);
    setGraphAfter(null);
    setGlobalError(null);
  }, []);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="size-4" /> Step-by-step chain
          </CardTitle>
          <CardDescription>
            Run the full incident response process in order, or run each step manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void runFullChain()} disabled={runningAll}>
            {runningAll ? <RefreshCcw className="animate-spin" /> : <ArrowRight />}
            {runningAll ? 'Running chain...' : 'Run full chain'}
          </Button>
          <Button variant="outline" onClick={resetFlow} disabled={runningAll}>
            Reset
          </Button>
        </CardContent>
      </Card>

      {globalError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {globalError}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <StepCard
          step="detect"
          state={stepState.detect}
          message={stepMsg.detect}
          runningAll={runningAll}
          onRun={() => void runStep('detect')}
        >
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Status: {incident?.status ?? 'unknown'}</li>
            <li>Root cause: {incident?.root_cause ?? 'none'}</li>
            <li>Failing tests: {incident?.failing_tests?.length ?? 0}</li>
          </ul>
        </StepCard>

        <StepCard
          step="diagnose"
          state={stepState.diagnose}
          message={stepMsg.diagnose}
          runningAll={runningAll}
          onRun={() => void runStep('diagnose')}
        >
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Severity: {diagnose?.diagnosis?.severity ?? 'unknown'}</li>
            <li>Runbook: {diagnose?.diagnosis?.cited_runbook ?? 'none'}</li>
            <li className="line-clamp-2">Summary: {diagnose?.diagnosis?.root_cause_explanation ?? 'n/a'}</li>
          </ul>
        </StepCard>

        <StepCard
          step="graphBefore"
          state={stepState.graphBefore}
          message={stepMsg.graphBefore}
          runningAll={runningAll}
          onRun={() => void runStep('graphBefore')}
        >
          <GraphSnapshotView snapshot={graphBefore} />
        </StepCard>

        <StepCard
          step="verify"
          state={stepState.verify}
          message={stepMsg.verify}
          runningAll={runningAll}
          onRun={() => void runStep('verify')}
        >
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Daytona verified: {String(Boolean(remediate?.verified))}</li>
            <li>Candidate path: {remediate?.candidate_fix?.path ?? 'none'}</li>
            <li className="line-clamp-2">Test output: {remediate?.test_output ?? 'n/a'}</li>
          </ul>
        </StepCard>

        <StepCard
          step="graphAfter"
          state={stepState.graphAfter}
          message={stepMsg.graphAfter}
          runningAll={runningAll}
          onRun={() => void runStep('graphAfter')}
        >
          <GraphSnapshotView snapshot={graphAfter} />
        </StepCard>

        <StepCard
          step="ship"
          state={stepState.ship}
          message={stepMsg.ship}
          runningAll={runningAll}
          onRun={() => void runStep('ship')}
        >
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>Status: {ship?.status ?? (ship?.pr_url ? 'shipped' : 'n/a')}</li>
            <li>
              PR:{' '}
              {ship?.pr_url ? (
                <a className="underline underline-offset-4" href={ship.pr_url} target="_blank" rel="noreferrer">
                  {ship.pr_url}
                </a>
              ) : (
                'not opened yet'
              )}
            </li>
            <li>MTTR seconds: {ship?.mttr_seconds ?? 'n/a'}</li>
          </ul>
        </StepCard>
      </div>
    </div>
  );
}

function StepCard({
  step,
  state,
  message,
  runningAll,
  onRun,
  children,
}: {
  step: StepKey;
  state: StepState;
  message: string;
  runningAll: boolean;
  onRun: () => void;
  children: React.ReactNode;
}) {
  const icon = step === 'verify' ? Wrench : step === 'ship' ? ShipWheel : step.includes('graph') ? GitBranch : CheckCircle2;
  const Icon = icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Icon className="size-4" />
            {STEP_TEXT[step].title}
          </span>
          <Badge variant="outline" className={cn(statusTone(state), 'capitalize')}>
            {state}
          </Badge>
        </CardTitle>
        <CardDescription>{STEP_TEXT[step].desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        <div className="text-xs text-muted-foreground">{message || 'Not run yet.'}</div>
        <Button size="sm" variant="outline" onClick={onRun} disabled={runningAll || state === 'running'}>
          {state === 'running' ? <RefreshCcw className="animate-spin" /> : null}
          Run step
        </Button>
      </CardContent>
    </Card>
  );
}

function GraphSnapshotView({ snapshot }: { snapshot: GraphSnapshot | null }) {
  if (!snapshot) return <div className="text-xs text-muted-foreground">No graph snapshot captured yet.</div>;

  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      <div>
        Captured {new Date(snapshot.capturedAt).toLocaleTimeString()} · total nodes {snapshot.total} · labels{' '}
        {snapshot.labelCount}
      </div>
      <div className="rounded-md border border-border/70 bg-muted/20 p-2">
        {snapshot.topFunctions.length ? (
          <ul className="space-y-1">
            {snapshot.topFunctions.map((node) => (
              <li key={`${snapshot.capturedAt}-${node.name}`} className="font-mono">
                {node.name} (in {node.incoming} / out {node.outgoing})
              </li>
            ))}
          </ul>
        ) : (
          <div>No function nodes returned.</div>
        )}
      </div>
    </div>
  );
}
