export type Severity = 'low' | 'medium' | 'high';
export type IncidentStatus =
  | 'diagnosing'
  | 'verifying'
  | 'pending_approval'
  | 'shipped'
  | 'resolved';
export type IncidentSource = 'sensor' | 'pagerduty' | 'sentry';

export interface Incident {
  id: string;
  rootCause: string;
  file: string;
  severity: Severity;
  status: IncidentStatus;
  failingTests: number;
  blastRadius: string[];
  citedRunbook: string | null;
  mttrSeconds: number | null;
  prUrl: string | null;
  source: IncidentSource;
  createdAt: string;
}

export const severityStyles: Record<Severity, { label: string; className: string; dot: string }> = {
  high: {
    label: 'High',
    className: 'border-destructive/30 bg-destructive/10 text-destructive',
    dot: 'bg-destructive',
  },
  medium: {
    label: 'Medium',
    className: 'border-warning/30 bg-warning/10 text-warning',
    dot: 'bg-warning',
  },
  low: {
    label: 'Low',
    className: 'border-success/30 bg-success/10 text-success',
    dot: 'bg-success',
  },
};

export const statusLabels: Record<IncidentStatus, string> = {
  diagnosing: 'Diagnosing',
  verifying: 'Verifying',
  pending_approval: 'Pending approval',
  shipped: 'Shipped',
  resolved: 'Resolved',
};

export const sourceLabels: Record<IncidentSource, string> = {
  sensor: 'Sensor',
  pagerduty: 'PagerDuty',
  sentry: 'Sentry',
};

export function inferSeverity(failingTests: number): Severity {
  if (failingTests >= 4) return 'high';
  if (failingTests >= 2) return 'medium';
  return 'low';
}
