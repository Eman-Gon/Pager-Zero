import { describe, it, expect } from "vitest";
import { sumRiskWeights, computeRiskScore } from "../src/riskScore.js";

describe("sumRiskWeights", () => {
  it("sums known procedure codes", () => {
    expect(sumRiskWeights(["A1", "B2"])).toBe(7);
  });

  it("returns 0 for an empty code list", () => {
    expect(sumRiskWeights([])).toBe(0);
  });

  it("uses a default weight of 1 for unknown codes", () => {
    expect(sumRiskWeights(["Z9"])).toBe(1);
  });
});

describe("computeRiskScore", () => {
  it("doubles the base score for urgent priority", () => {
    expect(
      computeRiskScore({ amount: 100, priority: "urgent", codes: ["A1"] })
    ).toBe(4);
  });

  it("keeps the base score for routine priority", () => {
    expect(
      computeRiskScore({ amount: 100, priority: "routine", codes: ["C3"] })
    ).toBe(8);
  });
});
