import { describe, it, expect } from "vitest";
import { computeTax, invoiceTotal, renderInvoice } from "../src/invoice.js";

describe("computeTax", () => {
  it("multiplies amount by rate", () => {
    expect(computeTax(100, 0.1)).toBe(10);
  });

  it("returns 0 tax at a 0% rate", () => {
    expect(computeTax(250, 0)).toBe(0);
  });
});

describe("invoiceTotal", () => {
  it("adds tax on top of the subtotal", () => {
    expect(invoiceTotal(100, 0.1)).toBe(110);
  });
});

describe("renderInvoice", () => {
  it("formats the grand total", () => {
    expect(renderInvoice(100, 0.1)).toBe("Total due: $110.00");
  });
});
