/**
 * Whether an applicant meets the minimum age. The rule is "18 or older".
 * BUG CLASS: off-by-one boundary comparison (>= vs. >), which wrongly
 * rejects applicants who are exactly 18.
 */
export function meetsAgeRequirement(age: number): boolean {
  return age >= 18;
}

/** Eligible when coverage is active AND the age requirement is met. */
export function isEligible(age: number, activeCoverage: boolean): boolean {
  return activeCoverage && meetsAgeRequirement(age);
}

/** Gate decision for the claim intake form. */
export function canSubmitClaim(age: number, activeCoverage: boolean): string {
  return isEligible(age, activeCoverage) ? "allow" : "deny";
}
