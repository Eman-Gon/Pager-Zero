import { describe, it, expect } from "vitest";
import { meetsAgeRequirement, isEligible, canSubmitClaim } from "../src/coverage.js";

describe("meetsAgeRequirement", () => {
  it("accepts someone exactly 18", () => {
    expect(meetsAgeRequirement(18)).toBe(true);
  });

  it("rejects someone under 18", () => {
    expect(meetsAgeRequirement(17)).toBe(false);
  });
});

describe("isEligible", () => {
  it("needs active coverage", () => {
    expect(isEligible(40, false)).toBe(false);
  });
});

describe("canSubmitClaim", () => {
  it("allows an eligible 18-year-old with coverage", () => {
    expect(canSubmitClaim(18, true)).toBe("allow");
  });
});
