import { describe, it, expect } from "vitest";
import { computeCopay } from "../src/pricing.js";

describe("computeCopay", () => {
  it("computes copay from claim amount and risk score", () => {
    const claim = { amount: 200, priority: "routine" as const, codes: [] };
    expect(computeCopay(claim, 10)).toBe(55);
  });

  it("rounds the result to two decimal places", () => {
    const claim = { amount: 33, priority: "routine" as const, codes: [] };
    expect(computeCopay(claim, 3)).toBe(11.1);
  });
});
