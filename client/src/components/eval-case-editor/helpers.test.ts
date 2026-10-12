import { describe, it, expect } from "vitest";
import type { EvalCaseDetail, EvalCaseDraft } from "@devdigest/shared";
import {
  bannerFacts,
  buildCaseInput,
  buildCaseUpdate,
  draftFromCase,
  draftFromSeed,
  draftProblems,
  editorMode,
  emptyDraft,
  exceedsDiffLimit,
  expectedProblem,
  expectedText,
  firstFreeOwner,
  hasUpdate,
  isCreatedManually,
  isDirty,
  ownerEvalsTabHref,
  parseExpectedOutput,
  pastedDiffPaths,
  skeletonText,
  utf8ByteLength,
} from "./helpers";

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

describe("pastedDiffPaths (AC-17, AC-21)", () => {
  it("lists the new-side paths of every file header style, first one first", () => {
    expect(pastedDiffPaths(TWO_FILES)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(pastedDiffPaths(PLUS_ONLY)).toEqual(["src/c.ts"]);
    expect(pastedDiffPaths(TWO_FILES.replace(/\n/g, "\r\n"))).toEqual(["src/a.ts", "src/b.ts"]);
  });
  it("finds no path in bare hunks or text with no diff", () => {
    expect(pastedDiffPaths(BARE_HUNKS)).toEqual([]);
    expect(pastedDiffPaths("just some words")).toEqual([]);
  });
});

describe("size (EC-1)", () => {
  it("measures the diff in UTF-8 bytes against 200 KB", () => {
    expect(utf8ByteLength("é")).toBe(2);
    expect(exceedsDiffLimit("a".repeat(204_800))).toBe(false);
    expect(exceedsDiffLimit("a".repeat(204_801))).toBe(true);
    expect(exceedsDiffLimit("é".repeat(102_401))).toBe(true);
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

const SEED: EvalCaseDraft = {
  name: "From finding: Hardcoded secret",
  expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "Hardcoded secret" },
  input_diff: TWO_FILES,
  input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "Add Stripe", body: null },
  owners: [
    { kind: "agent", id: "ag1", name: "Security", has_case: true, case_id: "c9" },
    { kind: "skill", id: "sk1", name: "Secrets", has_case: false, case_id: null },
  ],
};

describe("the seeded draft (AC-2, AC-4, AC-20, AC-21)", () => {
  it("fills everything but the notes and writes the expectation as an array of one object without the type", () => {
    const d = draftFromSeed(SEED);
    expect(d).toMatchObject({ name: "From finding: Hardcoded secret", title: "Add Stripe", description: "", type: "must_find", notes: "" });
    expect(JSON.parse(d.expected)).toEqual([
      { file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "Hardcoded secret" },
    ]);
    expect(parseExpectedOutput(d.expected, d.type)).toEqual({
      ok: true,
      expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "Hardcoded secret" },
    });
  });
  it("builds the finding skeleton: the first new-side path (empty without one), lines 1, nulls (AC-21)", () => {
    expect(JSON.parse(skeletonText(TWO_FILES))).toEqual([
      { file: "src/a.ts", start_line: 1, end_line: 1, severity: null, category: null, title: null },
    ]);
    expect(JSON.parse(skeletonText(""))[0].file).toBe("");
    expect(parseExpectedOutput(skeletonText(""), "must_find")).toMatchObject({ ok: false, problem: { code: "file" } });
    expect(parseExpectedOutput(skeletonText(TWO_FILES), "must_find").ok).toBe(true);
  });
  it("preselects the first owner without a case (AC-5)", () => {
    expect(firstFreeOwner(SEED.owners)?.id).toBe("sk1");
    expect(firstFreeOwner(SEED.owners.map((o) => ({ ...o, has_case: true })))).toBeNull();
  });
  it("links an owner to its Evals tab", () => {
    expect(ownerEvalsTabHref({ kind: "agent", id: "ag1" })).toBe("/agents/ag1?tab=evals");
    expect(ownerEvalsTabHref({ kind: "skill", id: "sk1" })).toBe("/skills/sk1?tab=evals");
  });
});

describe("parseExpectedOutput (AC-20, EC-6, EC-7, UI-1, UI-2)", () => {
  const one = (o: Record<string, unknown>) => JSON.stringify([o]);
  const base = { file: "src/a.ts", start_line: 2, end_line: 3 };
  const code = (text: string) => {
    const r = parseExpectedOutput(text, "must_find");
    return r.ok ? "ok" : r.problem.code;
  };

  it("takes the type from the switch, never from the text, and defaults the optional keys to null", () => {
    expect(parseExpectedOutput(one(base), "must_not_flag")).toEqual({
      ok: true,
      expectation: { type: "must_not_flag", ...base, severity: null, category: null, title: null },
    });
    expect(code(one({ ...base, type: "must_find" }))).toBe("unknownKey");
  });
  it("accepts only an array of exactly one object", () => {
    expect(code("")).toBe("empty");
    expect(code("  ")).toBe("empty");
    expect(code("{nope")).toBe("notJson");
    expect(code(JSON.stringify(base))).toBe("notArray");
    expect(code("[]")).toBe("notOneObject");
    expect(code(JSON.stringify([base, base]))).toBe("notOneObject");
    expect(code("[1]")).toBe("notObject");
    expect(code("[null]")).toBe("notObject");
    expect(code("[[]]")).toBe("notObject");
  });
  it("rejects every key outside the six, __proto__ and constructor included, and copies only the six", () => {
    expect(parseExpectedOutput(`[{"file":"a","start_line":1,"end_line":1,"__proto__":{"x":1}}]`, "must_find")).toEqual({
      ok: false,
      problem: { code: "unknownKey", key: "__proto__" },
    });
    expect(parseExpectedOutput(`[{"file":"a","start_line":1,"end_line":1,"constructor":{}}]`, "must_find")).toMatchObject({
      ok: false,
      problem: { code: "unknownKey", key: "constructor" },
    });
    const ok = parseExpectedOutput(one(base), "must_find");
    expect(ok.ok && Object.keys(ok.expectation).sort()).toEqual(["category", "end_line", "file", "severity", "start_line", "title", "type"]);
  });
  it("applies the EvalExpectationInput rules", () => {
    expect(code(one({ ...base, file: "" }))).toBe("file");
    expect(code(one({ ...base, file: "f".repeat(501) }))).toBe("file");
    expect(code(one({ ...base, file: 3 }))).toBe("file");
    expect(code(one({ file: "a", end_line: 1 }))).toBe("startLine");
    expect(code(one({ ...base, start_line: 0 }))).toBe("startLine");
    expect(code(one({ ...base, start_line: 1.5 }))).toBe("startLine");
    expect(code(one({ ...base, start_line: "2" }))).toBe("startLine");
    expect(code(one({ ...base, end_line: 0 }))).toBe("endLine");
    expect(code(one({ ...base, start_line: 5, end_line: 3 }))).toBe("endBeforeStart");
    expect(code(one({ ...base, severity: "INFO" }))).toBe("severity");
    expect(code(one({ ...base, severity: "WARNING", category: "bug", title: null }))).toBe("ok");
    expect(code(one({ ...base, category: "other" }))).toBe("category");
    expect(code(one({ ...base, title: "t".repeat(201) }))).toBe("title");
    expect(code(one({ ...base, title: 5 }))).toBe("title");
  });
  it("rejects text over 10,000 UTF-8 bytes before parsing it (EC-7)", () => {
    expect(code(`[${" ".repeat(10_000)}]`)).toBe("tooLarge");
    expect(code(one({ ...base, title: "é".repeat(5000) }))).toBe("tooLarge");
    const justFits = JSON.stringify([{ ...base }], null, 2);
    expect(utf8ByteLength(justFits)).toBeLessThan(10_000);
    expect(code(justFits)).toBe("ok");
  });
  it("reads the banner location leniently, from half-valid text too", () => {
    expect(bannerFacts(one({ ...base, title: "Leak", severity: "bogus" }))).toEqual({ file: "src/a.ts", startLine: 2, title: "Leak" });
    expect(bannerFacts(one({ ...base }))).toEqual({ file: "src/a.ts", startLine: 2, title: null });
    expect(bannerFacts("[")).toBeNull();
    expect(bannerFacts(one({ file: "", start_line: 1 }))).toBeNull();
  });
});

describe("draftProblems and expectedProblem (EC-1, EC-5, EC-6)", () => {
  const ok = { ...draftFromCase(stored()) };
  it("accepts a stored case", () => {
    expect(draftProblems(ok, "manual")).toEqual({});
    expect(expectedProblem(ok, "manual")).toBeNull();
  });
  it("flags every limit of EvalCaseInput", () => {
    const bad = { ...ok, name: " ", title: "t".repeat(201), description: "d".repeat(5001), notes: "n".repeat(2001) };
    expect(draftProblems(bad, "manual")).toEqual({ name: "required", title: "tooLong", description: "tooLong", notes: "tooLong" });
    expect(draftProblems({ ...ok, diff: "a".repeat(204_801) }, "manual")).toEqual({ diff: "tooLarge" });
    expect(draftProblems(emptyDraft(), "create")).toMatchObject({ name: "required", title: "required" });
    expect(expectedProblem(emptyDraft(), "create")).toEqual({ code: "empty" });
  });
  it("checks only name and notes in a finding-derived case, and never blocks on its locked expectation", () => {
    expect(draftProblems({ ...ok, title: "" }, "finding")).toEqual({});
    expect(expectedProblem({ ...ok, expected: "garbage" }, "finding")).toBeNull();
  });
});

describe("request bodies", () => {
  const expectation = { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "WARNING", category: "bug", title: null } as const;
  it("builds the create body with null for an empty description/notes (AC-6, AC-25)", () => {
    const d = { ...draftFromCase(stored()), notes: "" };
    expect(buildCaseInput(d, expectation)).toEqual({
      name: "manual-case",
      notes: null,
      input_diff: d.diff,
      input_meta: { title: "A title", body: null },
      expectation,
    });
  });
  it("sends only what changed: a rename is exactly { name } (AC-14)", () => {
    const initial = draftFromCase(stored());
    expect(buildCaseUpdate({ ...initial, name: "renamed" }, initial, "manual", expectation)).toEqual({ name: "renamed" });
    expect(buildCaseUpdate({ ...initial, notes: "why" }, initial, "manual", expectation)).toEqual({ notes: "why" });
  });
  it("sends the whole expectation / input_meta when a part of it changed (AC-15)", () => {
    const initial = draftFromCase(stored());
    const edited = { ...initial, title: "New title", expected: expectedText({ ...stored().expectation, end_line: 3 }) };
    const u = buildCaseUpdate(edited, initial, "manual", { ...expectation, end_line: 3 });
    expect(u.expectation).toMatchObject({ file: "src/a.ts", start_line: 2, end_line: 3, severity: "WARNING" });
    expect(u.input_meta).toEqual({ title: "New title", body: null });
    expect(u.input_diff).toBeUndefined();
    expect(u.name).toBeUndefined();
  });
  it("never sends locked fields for a finding-derived case (EC-6)", () => {
    const initial = draftFromCase(stored({ source_finding_id: "f1" }));
    const u = buildCaseUpdate({ ...initial, name: "n2", title: "hacked" }, initial, "finding", expectation);
    expect(u).toEqual({ name: "n2" });
  });
});

describe("isDirty (EC-8, EC-10)", () => {
  it("is false for the stored values and true after any edit", () => {
    const initial = draftFromCase(stored());
    expect(isDirty(initial, initial)).toBe(false);
    expect(isDirty({ ...initial, notes: "x" }, initial)).toBe(true);
    expect(isDirty(emptyDraft(), emptyDraft())).toBe(false);
    expect(isDirty({ ...emptyDraft(), name: "a" }, emptyDraft())).toBe(true);
    expect(isDirty({ ...initial, type: "must_not_flag" }, initial)).toBe(true);
  });

  it("EC-8: whitespace or key order of Expected output is no change and builds no body", () => {
    const initial = draftFromCase(stored());
    const reordered = JSON.stringify([{ title: null, category: "bug", severity: "WARNING", end_line: 2, start_line: 2, file: "src/a.ts" }]);
    const spaced = `\n  ${initial.expected.replace(/\n/g, "\n\n")}  `;
    const trailing = { ...initial, name: `${initial.name} `, title: ` ${initial.title}` };
    for (const draft of [{ ...initial, expected: reordered }, { ...initial, expected: spaced }, trailing]) {
      expect(isDirty(draft, initial)).toBe(false);
      expect(hasUpdate(buildCaseUpdate(draft, initial, "manual", parseOk(draft)))).toBe(false);
    }
  });
  it("every edit that is dirty builds a non-empty body", () => {
    const initial = draftFromCase(stored());
    const edits: Partial<typeof initial>[] = [
      { name: "renamed" },
      { title: "other" },
      { expected: expectedText({ ...stored().expectation, end_line: 3 }) },
      { diff: `${initial.diff}\n+more` },
    ];
    for (const edit of edits) {
      const draft = { ...initial, ...edit };
      expect(isDirty(draft, initial)).toBe(true);
      expect(hasUpdate(buildCaseUpdate(draft, initial, "manual", parseOk(draft)))).toBe(true);
    }
  });
  it("half-typed Expected output still counts as an edit", () => {
    expect(isDirty({ ...emptyDraft(), expected: "[{" }, emptyDraft())).toBe(true);
  });
});

function parseOk(draft: ReturnType<typeof draftFromCase>) {
  const r = parseExpectedOutput(draft.expected, draft.type);
  return r.ok ? r.expectation : null;
}
