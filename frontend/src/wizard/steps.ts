import type { MissionSnapshot } from '../api';

export type StepId = 'detect' | 'diagnose' | 'verify' | 'ship';

export interface WizardStep {
  id: StepId;
  /** Short label for the horizontal stepper. */
  label: string;
  /** Sponsor/tool credited on this step. */
  tool: string;
  /** Headline shown above the step body. */
  title: string;
  /** One-line explanation of what happens on this step. */
  blurb: string;
}

/**
 * The guided incident-response flow. Detect is passive (the sensor pushes the
 * incident); the rest are the three operator actions. Approval is folded into
 * Ship because the backend couples them — the Apply call is what creates the
 * approval, so the gate resolves in place on the Ship step.
 */
export const STEPS: WizardStep[] = [
  {
    id: 'detect',
    label: 'Detect',
    tool: 'Sensor · Neo4j',
    title: 'Detect the incident',
    blurb: 'The sensor watches the target repo and flags the breaking change. Neo4j maps the blast radius across the code graph.',
  },
  {
    id: 'diagnose',
    label: 'Diagnose',
    tool: 'RocketRide · Nebius',
    title: 'Diagnose the root cause',
    blurb: 'The RocketRide pipeline reasons over the failing tests, code graph, and cited runbooks to explain what broke and propose a fix.',
  },
  {
    id: 'verify',
    label: 'Verify',
    tool: 'Daytona',
    title: 'Verify the fix in a sandbox',
    blurb: 'The candidate fix is applied inside an isolated Daytona sandbox and run against the real test suite before anything ships.',
  },
  {
    id: 'ship',
    label: 'Ship',
    tool: 'GitHub',
    title: 'Approve & ship',
    blurb: 'High-risk fixes wait for human approval. Once cleared, a real GitHub PR opens and Time-to-Restore is recorded.',
  },
];

export function isStepComplete(id: StepId, snap: MissionSnapshot | null): boolean {
  if (!snap) return false;
  const p = snap.pipeline;
  switch (id) {
    case 'detect':
      return snap.live?.status === 'incident' || Boolean(snap.openIncident);
    case 'diagnose':
      return p.has_diagnose;
    case 'verify':
      return p.has_verified_fix;
    case 'ship':
      return p.shipped;
  }
}

/**
 * Index of the first step that is not yet complete — the furthest point the
 * operator is allowed to navigate to. Everything up to and including it is
 * reachable; later steps stay locked until their predecessors finish.
 */
export function firstIncompleteIndex(snap: MissionSnapshot | null): number {
  const idx = STEPS.findIndex((s) => !isStepComplete(s.id, snap));
  return idx === -1 ? STEPS.length - 1 : idx;
}
