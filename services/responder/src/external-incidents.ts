// Correlates an external alert (PagerDuty incident, Sentry issue) to the code
// incident it triggered, so the single ship choke point (shipVerifiedFix) can
// resolve the right alert once a PR is opened — including the pending-approval
// path where the ship happens out-of-band from the triggering webhook.
//
// Keyed by the incident's root_cause (one open incident = one root cause at a
// time in this system). In-process is sufficient — it mirrors the autonomous
// loop's in-memory dedup state and resets with the responder.

export interface ExternalRefs {
  pagerduty_incident_id?: string;
  sentry_issue_id?: string;
}

const store = new Map<string, ExternalRefs>();

function keyFor(rootCause: string | null | undefined): string {
  return rootCause ?? 'unknown';
}

export function registerExternal(rootCause: string | null | undefined, refs: ExternalRefs): void {
  const key = keyFor(rootCause);
  store.set(key, { ...(store.get(key) ?? {}), ...refs });
}

// Consume the refs (resolve happens exactly once per ship).
export function takeExternal(rootCause: string | null | undefined): ExternalRefs {
  const key = keyFor(rootCause);
  const refs = store.get(key) ?? {};
  store.delete(key);
  return refs;
}
