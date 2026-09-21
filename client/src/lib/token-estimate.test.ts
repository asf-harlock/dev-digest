import { describe, it, expect } from "vitest";
import { estimateTokens } from "./token-estimate";

describe("estimateTokens", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("approximates 1 token per 4 characters, rounding up", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});
