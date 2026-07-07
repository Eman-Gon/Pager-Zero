import type { CandidateFix, Diagnosis } from './pipeline.js';

const SEVERITIES = new Set(['low', 'medium', 'high']);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function normalizeFix(raw: unknown): CandidateFix | undefined {
  const o = asRecord(raw);
  const path = typeof o?.path === 'string' ? o.path.trim() : '';
  const content = typeof o?.content === 'string' ? o.content : '';
  if (!path || !content.trim()) return undefined;
  return { path, content };
}

/** Coerce and validate pipeline JSON; throws with a short reason if unusable. */
export function validateDiagnosis(raw: unknown): Diagnosis {
  const o = asRecord(raw);
  if (!o) throw new Error('diagnosis is not a JSON object');

  const severityRaw = String(o.severity ?? 'high').toLowerCase();
  const severity = SEVERITIES.has(severityRaw) ? (severityRaw as Diagnosis['severity']) : 'high';

  const root_cause_explanation = String(o.root_cause_explanation ?? '').trim();
  const proposed_fix_approach = String(o.proposed_fix_approach ?? '').trim();
  if (!root_cause_explanation) throw new Error('missing root_cause_explanation');

  const cited =
    o.cited_runbook === null || o.cited_runbook === undefined
      ? null
      : String(o.cited_runbook).trim() || null;

  const candidate_fix = normalizeFix(o.candidate_fix);
  if (!candidate_fix) throw new Error('missing or empty candidate_fix.path/content');

  let candidate_fixes: CandidateFix[] | undefined;
  if (Array.isArray(o.candidate_fixes)) {
    const fixes = o.candidate_fixes.map(normalizeFix).filter((f): f is CandidateFix => Boolean(f));
    if (fixes.length) candidate_fixes = fixes;
  }

  return {
    severity,
    root_cause_explanation,
    proposed_fix_approach: proposed_fix_approach || 'Apply the corrected expression in the root-cause file.',
    cited_runbook: cited,
    candidate_fix,
    candidate_fixes,
  };
}
