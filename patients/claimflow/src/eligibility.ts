import type { Patient } from "./types.js";

/**
 * A patient is eligible for claim processing if they are an adult
 * and currently have active coverage.
 */
export function checkEligibility(patient: Patient): boolean {
  return patient.age >= 18 && patient.hasActiveCoverage;
}
