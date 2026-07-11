import type { Claim } from "./types.js";

const CODE_WEIGHTS: Record<string, number> = {
  A1: 2,
  B2: 5,
  C3: 8,
  D4: 3,
};

/**
 * Sums the risk weight of each procedure code on the claim.
 * Unknown codes default to a weight of 1.
 */
export function sumRiskWeights(codes: string[]): number {
  let total = 0;
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i];
    total += CODE_WEIGHTS[code] ?? 1;
  }
  return total;
}

/**
 * Urgent claims carry double the base risk of routine claims.
 */
export function computeRiskScore(claim: Claim): number {
  const base = sumRiskWeights(claim.codes);
  const multiplier = claim.priority === "urgent" ? 2 : 1;
  return base * multiplier;
}
