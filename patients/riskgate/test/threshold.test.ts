import { describe, it, expect } from "vitest";
import { parseThreshold, isHighRisk, flagClaim } from "../src/threshold.js";

describe("parseThreshold", () => {
  it("parses a numeric string", () => {
    expect(parseThreshold("30")).toBe(30);
  });

  it("falls back to 50 when the value is missing", () => {
    expect(parseThreshold(undefined)).toBe(50);
  });
});

describe("isHighRisk", () => {
  it("uses the default threshold when unconfigured", () => {
    expect(isHighRisk(60, undefined)).toBe(true);
  });
});

describe("flagClaim", () => {
  it("routes a high score to review under the default threshold", () => {
    expect(flagClaim(60, undefined)).toBe("review");
  });
});
