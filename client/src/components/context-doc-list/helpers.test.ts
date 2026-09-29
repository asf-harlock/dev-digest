import { describe, it, expect } from "vitest";
import type { SpecFile } from "@devdigest/shared";
import { buildRows, collectInherited, moveAttached, summarizeBudget, toggleAttached } from "./helpers";

const f = (path: string, tokens = 10): SpecFile => ({ path, tokens }) as SpecFile;

describe("buildRows", () => {
  it("AC-16/EC-9: attached first in saved order, inherited next (own path wins), rest after; unlisted attached is missing", () => {
    const files = [f("a.md"), f("b.md"), f("c.md"), f("d.md")];
    const rows = buildRows({
      files,
      attached: ["c.md", "gone.md", "a.md"],
      inherited: [
        { path: "a.md", skillName: "s1" },
        { path: "d.md", skillName: "s1" },
      ],
      listingComplete: true,
    });
    expect(rows.map((r) => `${r.type}:${r.type === "file" ? r.file.path : r.path}`)).toEqual([
      "file:c.md",
      "missing:gone.md",
      "file:a.md",
      "inherited:d.md",
      "file:b.md",
    ]);
  });

  it("EC-3: with an incomplete listing an unlisted attached path is not reported missing", () => {
    const rows = buildRows({ files: [f("a.md")], attached: ["x.md"], listingComplete: false });
    expect(rows[0]).toMatchObject({ type: "file", attachedIndex: 0 });
  });

  it("page mode (no attached) yields plain file rows", () => {
    const rows = buildRows({ files: [f("a.md")], listingComplete: true });
    expect(rows).toEqual([{ type: "file", file: f("a.md"), attachedIndex: -1 }]);
  });
});

describe("toggleAttached / moveAttached", () => {
  it("AC-11: attach appends, detach keeps order, no duplicates", () => {
    expect(toggleAttached(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
    expect(toggleAttached(["a", "b", "c"], "b", false)).toEqual(["a", "c"]);
    expect(toggleAttached(["a", "b"], "a", true)).toEqual(["b", "a"]);
  });

  it("NFR-6: move swaps neighbours and returns null at the edges", () => {
    expect(moveAttached(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveAttached(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveAttached(["a", "b"], "a", -1)).toBeNull();
    expect(moveAttached(["a", "b"], "b", 1)).toBeNull();
    expect(moveAttached(["a"], "zzz", 1)).toBeNull();
  });
});

describe("collectInherited", () => {
  it("AC-16/EC-15: needs enabled link AND enabled skill AND not flagged; link order; first occurrence wins", () => {
    const out = collectInherited([
      { name: "s1", enabled: true, link_enabled: true, context_paths: ["x.md", "y.md"] },
      { name: "off-link", enabled: true, link_enabled: false, context_paths: ["l.md"] },
      { name: "off-skill", enabled: false, link_enabled: true, context_paths: ["k.md"] },
      { name: "flagged", enabled: true, link_enabled: true, injection_flagged: true, context_paths: ["f.md"] },
      { name: "s2", enabled: true, link_enabled: true, context_paths: ["y.md", "z.md"] },
      { name: "none", enabled: true, link_enabled: true, context_paths: null },
    ]);
    expect(out).toEqual([
      { path: "x.md", skillName: "s1" },
      { path: "y.md", skillName: "s1" },
      { path: "z.md", skillName: "s2" },
    ]);
  });
});

describe("summarizeBudget", () => {
  it("EC-13/AC-20: exact 16 000 fits; the first doc over the budget and everything after is skipped", () => {
    const tokens = new Map([
      ["a", 10_000],
      ["b", 6_000],
      ["c", 1],
      ["d", 0],
    ]);
    expect(summarizeBudget(["a", "b"], tokens)).toEqual({ total: 16_000, skipped: [] });
    expect(summarizeBudget(["a", "b", "c", "d"], tokens)).toEqual({ total: 16_000, skipped: ["c", "d"] });
  });

  it("AC-21: duplicates counted once; unknown (missing) paths contribute 0", () => {
    const tokens = new Map([["a", 5]]);
    expect(summarizeBudget(["a", "a", "ghost"], tokens)).toEqual({ total: 5, skipped: [] });
  });
});
