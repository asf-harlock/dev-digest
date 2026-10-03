import { describe, it, expect } from "vitest";
import { sizeKb } from "./helpers";

describe("sizeKb", () => {
  it("rounds up to whole KB so a doc just over a limit never reads as at it", () => {
    expect(sizeKb(64 * 1024)).toBe(64);
    expect(sizeKb(64 * 1024 + 1)).toBe(65);
    expect(sizeKb(0)).toBe(0);
    expect(sizeKb(undefined)).toBe(0);
  });
});
