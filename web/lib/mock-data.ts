// Self-contained mock data so the demo runs with zero backend. The shapes mirror
// the real RescueOps++ services (sensor /incident, responder actions) so swapping
// in live data via NEXT_PUBLIC_SENSOR_URL / NEXT_PUBLIC_RESPONDER_URL is a drop-in.

export type Severity = 'low' | 'medium' | 'high';
export type IncidentStatus = 'diagnosing' | 'verifying' | 'pending_approval' | 'shipped' | 'resolved';

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
  source: 'sensor' | 'pagerduty' | 'sentry';
  createdAt: string;
}

const now = Date.now();
const minsAgo = (m: number) => new Date(now - m * 60_000).toISOString();

export const incidents: Incident[] = [
  {
    id: 'INC-2041',
    rootCause: 'computeTax',
    file: 'src/tax.ts',
    severity: 'high',
    status: 'pending_approval',
    failingTests: 3,
    blastRadius: ['invoiceTotal', 'renderInvoice'],
    citedRunbook: 'Wrong operator in arithmetic computation',
    mttrSeconds: null,
    prUrl: null,
    source: 'pagerduty',
    createdAt: minsAgo(4),
  },
  {
    id: 'INC-2040',
    rootCause: 'parseThreshold',
    file: 'src/risk/score.ts',
    severity: 'medium',
    status: 'verifying',
    failingTests: 2,
    blastRadius: ['scoreClaim'],
    citedRunbook: 'Off-by-one in boundary comparison',
    mttrSeconds: null,
    prUrl: null,
    source: 'sentry',
    createdAt: minsAgo(11),
  },
  {
    id: 'INC-2039',
    rootCause: 'normalizeEmail',
    file: 'src/auth/normalize.ts',
    severity: 'low',
    status: 'shipped',
    failingTests: 1,
    blastRadius: ['signIn'],
    citedRunbook: 'Unicode casing edge case',
    mttrSeconds: 612,
    prUrl: 'https://github.com/acme/patient/pull/318',
    source: 'sensor',
    createdAt: minsAgo(48),
  },
  {
    id: 'INC-2038',
    rootCause: 'applyDiscount',
    file: 'src/pricing/discount.ts',
    severity: 'high',
    status: 'resolved',
    failingTests: 5,
    blastRadius: ['cartTotal', 'checkout', 'renderReceipt'],
    citedRunbook: 'Percentage vs. fraction mismatch',
    mttrSeconds: 1284,
    prUrl: 'https://github.com/acme/patient/pull/317',
    source: 'pagerduty',
    createdAt: minsAgo(126),
  },
  {
    id: 'INC-2037',
    rootCause: 'serializeCursor',
    file: 'src/db/cursor.ts',
    severity: 'medium',
    status: 'resolved',
    failingTests: 2,
    blastRadius: ['listPage'],
    citedRunbook: 'Base64 padding dropped',
    mttrSeconds: 903,
    prUrl: 'https://github.com/acme/patient/pull/315',
    source: 'sentry',
    createdAt: minsAgo(240),
  },
];

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

// 14-day trend for the incidents-over-time area chart.
export const incidentTrend = Array.from({ length: 14 }).map((_, i) => {
  const base = 6 + Math.round(4 * Math.sin(i / 2)) + (i % 3);
  return {
    day: new Date(now - (13 - i) * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    detected: base,
    autoShipped: Math.max(0, base - 2 - (i % 2)),
  };
});

// Weekly mean-time-to-restore (minutes) — trending down as memory improves.
export const mttrTrend = [
  { week: 'W1', mttr: 41 },
  { week: 'W2', mttr: 37 },
  { week: 'W3', mttr: 34 },
  { week: 'W4', mttr: 29 },
  { week: 'W5', mttr: 24 },
  { week: 'W6', mttr: 21 },
  { week: 'W7', mttr: 18 },
  { week: 'W8', mttr: 14 },
];

export const severityBreakdown = [
  { name: 'High', value: 18, key: 'high' as Severity },
  { name: 'Medium', value: 34, key: 'medium' as Severity },
  { name: 'Low', value: 48, key: 'low' as Severity },
];

export const kpis = {
  openIncidents: 2,
  autoResolveRate: 0.86,
  medianMttrSeconds: 840,
  prsShippedWeek: 27,
};
