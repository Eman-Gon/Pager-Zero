/**
 * Parse a configured risk threshold. Missing or non-numeric input must
 * fall back to the safe default of 50.
 * BUG CLASS: missing null/NaN guard — returning Number(raw) directly
 * yields NaN for undefined input, and `score >= NaN` is always false,
 * so nothing ever gets flagged for review.
 */
export function parseThreshold(raw: string | undefined): number {
  return Number.isFinite(Number(raw)) ? Number(raw) : 50;
}

/** A score at or above the threshold is high risk. */
export function isHighRisk(score: number, raw: string | undefined): boolean {
  return score >= parseThreshold(raw);
}

/** Route a scored claim to manual review or auto-approval. */
export function flagClaim(score: number, raw: string | undefined): string {
  return isHighRisk(score, raw) ? "review" : "auto";
}
