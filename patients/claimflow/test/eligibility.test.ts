import { describe, it, expect } from "vitest";
import { checkEligibility } from "../src/eligibility.js";

describe("checkEligibility", () => {
  it("returns true for an adult with active coverage", () => {
    expect(checkEligibility({ age: 30, hasActiveCoverage: true })).toBe(true);
  });

  it("returns false for a minor", () => {
    expect(checkEligibility({ age: 15, hasActiveCoverage: true })).toBe(false);
  });

  it("returns false without active coverage", () => {
    expect(checkEligibility({ age: 40, hasActiveCoverage: false })).toBe(false);
  });
});
