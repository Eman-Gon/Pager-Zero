import { describe, it, expect } from "vitest";
import { normalizeEmail, accountKey, sameUser } from "../src/normalize.js";

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });

  it("leaves an already-canonical address unchanged", () => {
    expect(normalizeEmail("a@b.com")).toBe("a@b.com");
  });
});

describe("accountKey", () => {
  it("prefixes the normalized email", () => {
    expect(accountKey("A@B.com")).toBe("user:a@b.com");
  });
});

describe("sameUser", () => {
  it("treats case/whitespace variants as one user", () => {
    expect(sameUser("A@b.com", " a@B.COM ")).toBe(true);
  });
});
