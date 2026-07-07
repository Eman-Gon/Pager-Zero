import type { Claim, Patient, Decision } from "./types.js";
import { checkEligibility } from "./eligibility.js";
import { computeRiskScore } from "./riskScore.js";
import { computeCopay } from "./pricing.js";

const RISK_THRESHOLD = 30;

export function decideApproval(patient: Patient, claim: Claim): Decision {
  const eligible = checkEligibility(patient);
  const riskScore = computeRiskScore(claim);
  const copay = eligible ? computeCopay(claim, riskScore) : 0;

  if (!eligible) {
    return { approved: false, copay, riskScore, reason: "not eligible" };
  }
  if (riskScore > RISK_THRESHOLD) {
    return { approved: false, copay, riskScore, reason: "risk too high" };
  }
  return { approved: true, copay, riskScore, reason: "meets criteria" };
}
