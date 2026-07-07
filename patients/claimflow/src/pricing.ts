import type { Claim } from "./types.js";

/**
 * Copay is 20% of the claim amount plus a risk-based surcharge.
 */
export function computeCopay(claim: Claim, riskScore: number): number {
  const base = claim.amount * 0.2;
  const riskAdjustment = riskScore * 1.5;
  const copay = base + riskAdjustment;
  return Math.round(copay * 100) / 100;
}
