import { describe, it, expect } from "vitest";
import { decideApproval } from "../src/approval.js";

describe("decideApproval", () => {
  it("approves an eligible, low-risk claim", () => {
    const patient = { age: 25, hasActiveCoverage: true };
    const claim = { amount: 100, priority: "routine" as const, codes: ["A1"] };
    expect(decideApproval(patient, claim)).toEqual({
      approved: true,
      copay: 23,
      riskScore: 2,
      reason: "meets criteria",
    });
  });

  it("denies an ineligible patient", () => {
    const patient = { age: 10, hasActiveCoverage: true };
    const claim = { amount: 100, priority: "routine" as const, codes: ["A1"] };
    const result = decideApproval(patient, claim);
    expect(result.approved).toBe(false);
    expect(result.reason).toBe("not eligible");
  });

  it("denies a high-risk claim", () => {
    const patient = { age: 25, hasActiveCoverage: true };
    const claim = {
      amount: 500,
      priority: "urgent" as const,
      codes: ["C3", "B2", "D4"],
    };
    const result = decideApproval(patient, claim);
    expect(result.approved).toBe(false);
    expect(result.reason).toBe("risk too high");
  });
});
