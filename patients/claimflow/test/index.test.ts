import { describe, it, expect } from "vitest";
import { processClaim, formatDecision } from "../src/index.js";

describe("formatDecision", () => {
  it("formats an approved decision", () => {
    expect(
      formatDecision({
        approved: true,
        copay: 23,
        riskScore: 2,
        reason: "meets criteria",
      })
    ).toBe("APPROVED | risk=2 | copay=$23.00 | meets criteria");
  });
});

describe("processClaim", () => {
  it("runs the full pipeline for an approved claim", () => {
    const patient = { age: 25, hasActiveCoverage: true };
    const claim = { amount: 100, priority: "routine" as const, codes: ["A1"] };
    expect(processClaim(patient, claim)).toBe(
      "APPROVED | risk=2 | copay=$23.00 | meets criteria"
    );
  });

  it("runs the full pipeline for a denied, ineligible claim", () => {
    const patient = { age: 10, hasActiveCoverage: true };
    const claim = { amount: 100, priority: "routine" as const, codes: ["A1"] };
    expect(processClaim(patient, claim)).toBe(
      "DENIED | risk=2 | copay=$0.00 | not eligible"
    );
  });
});
