import { describe, it, expect } from "vitest";
import { filterPaths, moveItem } from "./helpers";
import { isContextStale } from "@/lib/hooks/pr-context";

describe("ContextTab helpers", () => {
  it("AC-4: moveItem swaps neighbours and ignores moves past either end", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("AC-3: filterPaths is a case-insensitive substring match; blank keeps everything", () => {
    const items = [{ path: "Specs/07.md" }, { path: "docs/a.md" }];
    expect(filterPaths(items, "  SPECS ")).toEqual([items[0]]);
    expect(filterPaths(items, " ")).toBe(items);
  });
});

describe("isContextStale (AC-38..40, EC-21)", () => {
  it("is stale only when a stored fingerprint differs from a known current one", () => {
    expect(isContextStale("a", "b")).toBe(true);
    expect(isContextStale("a", null)).toBe(true);
    expect(isContextStale("a", "a")).toBe(false);
    expect(isContextStale(null, "b")).toBe(false);
    expect(isContextStale(undefined, "b")).toBe(false);
    expect(isContextStale("a", undefined)).toBe(false);
  });
});
