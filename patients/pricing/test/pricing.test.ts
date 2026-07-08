import { describe, it, expect } from "vitest";
import { applyDiscount, cartTotal, checkout } from "../src/pricing.js";

describe("applyDiscount", () => {
  it("takes 20% off a price", () => {
    expect(applyDiscount(100, 20)).toBe(80);
  });

  it("returns the full price at 0% off", () => {
    expect(applyDiscount(50, 0)).toBe(50);
  });
});

describe("cartTotal", () => {
  it("discounts the summed cart", () => {
    expect(cartTotal([50, 50], 20)).toBe(80);
  });
});

describe("checkout", () => {
  it("formats the charged amount", () => {
    expect(checkout([50, 50], 20)).toBe("Charged $80.00");
  });
});
