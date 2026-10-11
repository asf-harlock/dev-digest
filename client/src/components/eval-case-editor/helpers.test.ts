import { describe, it, expect } from "vitest";
import type { EvalCaseDetail } from "@devdigest/shared";
import {
  buildCaseInput,
  buildCaseUpdate,
  chosenFileHunks,
  countPatchLines,
  draftFromCase,
  draftProblems,
  editorMode,
  emptyDraft,
  exceedsDiffLimit,
  frozenDiffFile,
  highlightRangeOf,
  isCreatedManually,
  hasUpdate,
  isDirty,
  parseLine,
  pastedDiffPaths,
  previewFile,
  resolveFile,
  stripDiffHeaders,
  utf8ByteLength,
} from "./helpers";

const HUNK = "@@ -1,2 +1,3 @@\n keep\n-old\n+new\n+more";
const WITH_HEADERS = `diff --git a/src/a.ts b/src/a.ts\nindex 111..222 100644\n--- a/src/a.ts\n+++ b/src/a.ts\n${HUNK}`;
const expectation = { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2 } as const;

describe("stripDiffHeaders", () => {
  it("drops everything before the first @@ line", () => {
    expect(stripDiffHeaders(WITH_HEADERS)).toBe(HUNK);
  });
  it("leaves a header-less patch and a patch with no hunk untouched", () => {
    expect(stripDiffHeaders(HUNK)).toBe(HUNK);
    expect(stripDiffHeaders("Binary files differ")).toBe("Binary files differ");
  });
});

describe("frozenDiffFile", () => {
  it("passes only hunk lines to the viewer and counts +/- from them", () => {
    const f = frozenDiffFile({ input_diff: WITH_HEADERS, expectation });
    expect(f.patch).toBe(HUNK);
    expect(f.patch).not.toContain("diff --git");
    expect(f.patch).not.toContain("+++ b/");
    expect(f.path).toBe("src/a.ts");
    expect(f.additions).toBe(2);
    expect(f.deletions).toBe(1);
  });
});

describe("countPatchLines", () => {
  it("ignores header lines before the first hunk", () => {
    expect(countPatchLines(WITH_HEADERS)).toEqual({ additions: 2, deletions: 1 });
  });
});

const TWO_FILES = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,1 +1,2 @@",
  " keep",
  "+added-a",
  "diff --git a/src/b.ts b/src/b.ts",
  "--- a/src/b.ts",
  "+++ b/src/b.ts",
  "@@ -5,1 +5,2 @@",
  " ctx",
  "+added-b",
].join("\n");
const BARE_HUNKS = "@@ -1,1 +1,2 @@\n keep\n+added";
const PLUS_ONLY = "+++ b/src/c.ts\n@@ -1,1 +1,2 @@\n keep\n+added-c";

describe("pastedDiffPaths (AC-6, AC-7)", () => {
  it("lists the new-side paths of every file header style, first one first", () => {
    expect(pastedDiffPaths(TWO_FILES)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(pastedDiffPaths(PLUS_ONLY)).toEqual(["src/c.ts"]);
    expect(pastedDiffPaths(TWO_FILES.replace(/\n/g, "\r\n"))).toEqual(["src/a.ts", "src/b.ts"]);
  });
  it("finds no path in bare hunks or text with no diff, so the file is typed (AC-7)", () => {
    expect(pastedDiffPaths(BARE_HUNKS)).toEqual([]);
    expect(pastedDiffPaths("just some words")).toEqual([]);
    expect(resolveFile(BARE_HUNKS, " src/x.ts ")).toEqual({ paths: [], file: "src/x.ts" });
  });
  it("preselects the first path until the user picks another that is still in the diff", () => {
    expect(resolveFile(TWO_FILES, "")).toEqual({ paths: ["src/a.ts", "src/b.ts"], file: "src/a.ts" });
    expect(resolveFile(TWO_FILES, "src/b.ts").file).toBe("src/b.ts");
    expect(resolveFile(TWO_FILES, "gone.ts").file).toBe("src/a.ts");
  });
});

describe("previewFile / chosenFileHunks (AC-8)", () => {
  it("draws only the chosen file's hunks, without headers", () => {
    const f = previewFile(TWO_FILES, "src/b.ts");
    expect(f?.path).toBe("src/b.ts");
    expect(f?.patch).toBe("@@ -5,1 +5,2 @@\n ctx\n+added-b");
    expect(f?.patch).not.toContain("added-a");
    expect(f?.additions).toBe(1);
  });
  it("treats bare hunks as the typed file's and shows nothing while there is no hunk", () => {
    expect(chosenFileHunks(BARE_HUNKS, "src/x.ts")).toBe(BARE_HUNKS);
    expect(previewFile("", "src/x.ts")).toBeNull();
    expect(previewFile("diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts", "src/a.ts")).toBeNull();
    expect(previewFile(TWO_FILES, "missing.ts")).toBeNull();
  });
});

describe("size, lines and range", () => {
  it("measures the diff in UTF-8 bytes against 200 KB (EC-1)", () => {
    expect(utf8ByteLength("é")).toBe(2);
    expect(exceedsDiffLimit("a".repeat(204_800))).toBe(false);
    expect(exceedsDiffLimit("a".repeat(204_801))).toBe(true);
    expect(exceedsDiffLimit("é".repeat(102_401))).toBe(true);
  });
  it("accepts only whole numbers of 1 or more as lines (EC-4)", () => {
    expect(parseLine("12")).toBe(12);
    for (const bad of ["", "0", "-1", "1.5", "abc", "1e3"]) expect(parseLine(bad)).toBeNull();
  });
  it("highlights the range only while start and end are valid", () => {
    expect(highlightRangeOf({ start: "2", end: "4" })).toEqual({ start: 2, end: 4 });
    expect(highlightRangeOf({ start: "5", end: "4" })).toBeNull();
    expect(highlightRangeOf({ start: "", end: "4" })).toBeNull();
  });
});

function stored(over: Partial<EvalCaseDetail> = {}): EvalCaseDetail {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "manual-case",
    input_diff: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n keep\n+added",
    input_meta: { pr_number: null, repo_full_name: null, title: "A title", body: null },
    expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "WARNING", category: "bug" },
    source_finding_id: null,
    notes: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    source: null,
    latest_result: null,
    ...over,
  };
}

describe("editor modes (EC-6, EC-7, AC-19)", () => {
  it("is create without a case, manual without a source finding, finding otherwise", () => {
    expect(editorMode(null)).toBe("create");
    expect(editorMode(stored())).toBe("manual");
    expect(editorMode(stored({ source_finding_id: "f1" }))).toBe("finding");
  });
  it("calls a case manual only with no source finding and no PR", () => {
    expect(isCreatedManually(stored())).toBe(true);
    expect(isCreatedManually(stored({ source_finding_id: "f1" }))).toBe(false);
    expect(isCreatedManually(stored({ input_meta: { pr_number: 7, title: "t", body: null } }))).toBe(false);
  });
});

describe("draftProblems (EC-1, EC-4, EC-5)", () => {
  const ok = { ...draftFromCase(stored()) };
  it("accepts a stored case", () => {
    expect(draftProblems(ok, "manual", "src/a.ts")).toEqual({});
  });
  it("flags every limit of EvalCaseInput", () => {
    const bad = {
      ...ok,
      name: " ",
      title: "t".repeat(201),
      description: "d".repeat(5001),
      notes: "n".repeat(2001),
      start: "0",
      end: "x",
    };
    expect(draftProblems(bad, "manual", "f".repeat(501))).toEqual({
      name: "required",
      title: "tooLong",
      description: "tooLong",
      notes: "tooLong",
      file: "tooLong",
      start: "lineInvalid",
      end: "lineInvalid",
    });
    expect(draftProblems({ ...ok, start: "5", end: "3" }, "manual", "src/a.ts")).toEqual({ end: "endBeforeStart" });
    expect(draftProblems({ ...ok, diff: "a".repeat(204_801) }, "manual", "src/a.ts")).toEqual({ diff: "tooLarge" });
    expect(draftProblems(emptyDraft(), "create", "").file).toBe("required");
  });
  it("checks only name and notes in a finding-derived case", () => {
    expect(draftProblems({ ...ok, title: "", start: "" }, "finding", "")).toEqual({});
  });
});

describe("request bodies", () => {
  it("builds the create body with null for an empty description/notes and no severity on must_not_flag (EC-41)", () => {
    const d = { ...draftFromCase(stored()), type: "must_not_flag" as const, notes: "" };
    expect(buildCaseInput(d, "src/a.ts")).toEqual({
      name: "manual-case",
      notes: null,
      input_diff: d.diff,
      input_meta: { title: "A title", body: null },
      expectation: { type: "must_not_flag", file: "src/a.ts", start_line: 2, end_line: 2, severity: null, category: null },
    });
  });
  it("sends only what changed: a rename is exactly { name } (AC-14)", () => {
    const initial = draftFromCase(stored());
    expect(buildCaseUpdate({ ...initial, name: "renamed" }, initial, "manual", "src/a.ts")).toEqual({ name: "renamed" });
    expect(buildCaseUpdate({ ...initial, notes: "why" }, initial, "manual", "src/a.ts")).toEqual({ notes: "why" });
  });
  it("sends the whole expectation / input_meta when a part of it changed (AC-15)", () => {
    const initial = draftFromCase(stored());
    const u = buildCaseUpdate({ ...initial, end: "3", title: "New title" }, initial, "manual", "src/a.ts");
    expect(u.expectation).toMatchObject({ file: "src/a.ts", start_line: 2, end_line: 3, severity: "WARNING" });
    expect(u.input_meta).toEqual({ title: "New title", body: null });
    expect(u.input_diff).toBeUndefined();
    expect(u.name).toBeUndefined();
  });
  it("never sends locked fields for a finding-derived case (EC-6)", () => {
    const initial = draftFromCase(stored({ source_finding_id: "f1" }));
    const u = buildCaseUpdate({ ...initial, name: "n2", title: "hacked" }, initial, "finding", "src/a.ts");
    expect(u).toEqual({ name: "n2" });
  });
});

describe("isDirty (EC-8)", () => {
  it("is false for the stored values and true after any edit; hidden severity on must_not_flag is no change", () => {
    const initial = draftFromCase(stored());
    expect(isDirty(initial, initial)).toBe(false);
    expect(isDirty({ ...initial, notes: "x" }, initial)).toBe(true);
    expect(isDirty(emptyDraft(), emptyDraft())).toBe(false);
    expect(isDirty({ ...emptyDraft(), name: "a" }, emptyDraft())).toBe(true);
    const nf = { ...initial, type: "must_not_flag" as const };
    expect(isDirty({ ...nf, severity: "CRITICAL" }, nf)).toBe(false);
  });

  it("B2/AC-14: an edit that buildCaseUpdate would not send (trimmed name, \"5\" -> \"05\") is not dirty and builds no body", () => {
    const initial = draftFromCase(stored());
    const trailing = { ...initial, name: `${initial.name} `, title: ` ${initial.title}` };
    const padded = { ...initial, start: "02", end: " 2 " };
    for (const draft of [trailing, padded]) {
      expect(isDirty(draft, initial)).toBe(false);
      expect(hasUpdate(buildCaseUpdate(draft, initial, "manual", "src/a.ts"))).toBe(false);
    }
    expect(buildCaseUpdate(padded, initial, "manual", "src/a.ts")).toEqual({});
  });
  it("B2: every edit that is dirty builds a non-empty body", () => {
    const initial = draftFromCase(stored());
    const edits: Partial<typeof initial>[] = [
      { name: "renamed" },
      { title: "other" },
      { end: "3" },
      { diff: `${initial.diff}\n+more` },
      { severity: "CRITICAL" },
    ];
    for (const edit of edits) {
      const draft = { ...initial, ...edit };
      expect(isDirty(draft, initial)).toBe(true);
      expect(hasUpdate(buildCaseUpdate(draft, initial, "manual", "src/a.ts"))).toBe(true);
    }
  });
  it("B2: a half-typed line still counts as an edit (EC-8)", () => {
    expect(isDirty({ ...emptyDraft(), start: "abc" }, emptyDraft())).toBe(true);
  });
});
