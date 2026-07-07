import type { Claim, Patient, Decision } from "./types.js";
import { decideApproval } from "./approval.js";

export function formatDecision(decision: Decision): string {
  const status = decision.approved ? "APPROVED" : "DENIED";
  return `${status} | risk=${decision.riskScore} | copay=$${decision.copay.toFixed(2)} | ${decision.reason}`;
}

/**
 * Root entry point: takes a patient and a claim, runs the full
 * eligibility -> risk -> pricing -> approval pipeline, and returns
 * a human-readable decision summary.
 */
export function processClaim(patient: Patient, claim: Claim): string {
  const decision = decideApproval(patient, claim);
  return formatDecision(decision);
}
