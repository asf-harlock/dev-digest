import type {
  EvalCaseDetail,
  EvalCaseDraft,
  EvalCaseEffect,
  EvalCaseInput,
  EvalCaseUpdate,
  EvalExpectation,
  EvalExpectationType,
} from "@devdigest/shared";
import {
  CATEGORIES,
  DESCRIPTION_MAX_LENGTH,
  EXPECTED_KEYS,
  EXPECTED_MAX_BYTES,
  FILE_MAX_LENGTH,
  MAX_DIFF_BYTES,
  NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  SEVERITIES,
  TITLE_MAX_LENGTH,
} from "./constants";

// ---------------------------------------------------------------------------
// Pasted diff — a client mirror of the server's pasted-diff reading, used only to list
// the diff's files (Files tab, skeleton). The server re-reads the diff and stays the
// authority (EC-2, EC-9).
// ---------------------------------------------------------------------------

const FILE_MARKER = "diff --git ";
const OLD_PREFIX = "--- ";
const NEW_PREFIX = "+++ ";
const HUNK_MARKER = "@@";

/** CRLF (and a lone CR) → LF, as the server does before parsing (AC-46). */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** UTF-8 byte length — the unit of the 200 KB cap (EC-1). */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function exceedsDiffLimit(text: string): boolean {
  return utf8ByteLength(text) > MAX_DIFF_BYTES;
}

/** The path in a `---` / `+++` line: no `a/`/`b/` prefix, no trailing tab-timestamp. */
function headerPath(line: string, side: "a" | "b"): string | null {
  const raw = (line.slice(4).split("\t")[0] ?? "").trim();
  if (raw === "" || raw === "/dev/null") return null;
  return raw.startsWith(`${side}/`) ? raw.slice(2) : raw;
}

interface DiffSection {
  /** New-side path; null for bare hunks (the file is typed separately). */
  path: string | null;
  lines: string[];
}

function splitGit(lines: string[]): DiffSection[] {
  const sections: DiffSection[] = [];
  let current: DiffSection | null = null;
  for (const line of lines) {
    if (line.startsWith(FILE_MARKER)) {
      current = { path: line.match(/^diff --git a\/.+ b\/(.+)$/)?.[1]?.trim() ?? null, lines: [] };
      sections.push(current);
    } else if (current) {
      if (line.startsWith(NEW_PREFIX)) current.path = headerPath(line, "b") ?? current.path;
      current.lines.push(line);
    }
  }
  return sections;
}

function splitHeaderless(lines: string[]): DiffSection[] {
  const sections: DiffSection[] = [];
  let current: DiffSection | null = null;
  const at = (i: number) => lines[i] ?? "";
  for (let i = 0; i < lines.length; i++) {
    const line = at(i);
    if (line.startsWith(OLD_PREFIX) && at(i + 1).startsWith(NEW_PREFIX) && at(i + 2).startsWith(HUNK_MARKER)) {
      current = { path: headerPath(at(i + 1), "b") ?? headerPath(line, "a"), lines: [] };
      sections.push(current);
      i += 1;
    } else if (line.startsWith(NEW_PREFIX) && at(i + 1).startsWith(HUNK_MARKER)) {
      current = { path: headerPath(line, "b"), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else if (line.startsWith(HUNK_MARKER)) {
      current = { path: null, lines: [line] };
      sections.push(current);
    }
  }
  return sections;
}

/** Per-file sections of a pasted diff (`diff --git` headers, `---`/`+++` headers or bare hunks). */
export function splitPastedDiff(pasted: string): DiffSection[] {
  const lines = normalizeNewlines(pasted).split("\n");
  return lines.some((l) => l.startsWith(FILE_MARKER)) ? splitGit(lines) : splitHeaderless(lines);
}

/** New-side file paths found in the diff, first-seen order (AC-17, AC-21); `[]` for bare hunks. */
export function pastedDiffPaths(pasted: string): string[] {
  const paths: string[] = [];
  for (const section of splitPastedDiff(pasted)) {
    if (section.path && !paths.includes(section.path)) paths.push(section.path);
  }
  return paths;
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

/** What the editor shows. Strings throughout so half-typed input is representable. The
 *  expectation lives in `expected` as the JSON text of the Expected output pane (AC-20). */
export interface CaseDraft {
  name: string;
  /** PR title (PR meta tab). */
  title: string;
  description: string;
  diff: string;
  type: EvalExpectationType;
  expected: string;
  notes: string;
}

/** The expectation as `EvalCaseInput` carries it. */
export type ExpectationInput = EvalCaseInput["expectation"];

/** The Expected output text of an expectation: an array of exactly one object with the six
 *  keys in a fixed order (AC-20). `type` is not part of it. */
export function expectedText(e: Pick<EvalExpectation, "file" | "start_line" | "end_line" | "severity" | "category" | "title">): string {
  return JSON.stringify(
    [
      {
        file: e.file,
        start_line: e.start_line,
        end_line: e.end_line,
        severity: e.severity ?? null,
        category: e.category ?? null,
        title: e.title ?? null,
      },
    ],
    null,
    2,
  );
}

/** AC-21: one object, `file` the first new-side path of the diff (empty when there is none),
 *  both lines `1`, severity / category / title `null`. */
export function skeletonText(diff: string): string {
  return expectedText({ file: pastedDiffPaths(diff)[0] ?? "", start_line: 1, end_line: 1, severity: null, category: null, title: null });
}

/** A blank new case: every field empty except the type, `must_find` (AC-18). */
export function emptyDraft(): CaseDraft {
  return { name: "", title: "", description: "", diff: "", type: "must_find", expected: "", notes: "" };
}

/** A stored case, prefilled. */
export function draftFromCase(c: EvalCaseDetail): CaseDraft {
  return {
    name: c.name,
    title: c.input_meta.title,
    description: c.input_meta.body ?? "",
    diff: c.input_diff,
    type: c.expectation.type,
    expected: expectedText(c.expectation),
    notes: c.notes ?? "",
  };
}

/** The finding's seed (AC-2, AC-4): everything but the notes is filled in. */
export function draftFromSeed(d: EvalCaseDraft): CaseDraft {
  return {
    name: d.name,
    title: d.input_meta.title,
    description: d.input_meta.body ?? "",
    diff: d.input_diff,
    type: d.expectation.type,
    expected: expectedText(d.expectation),
    notes: "",
  };
}

/** Create, edit a manual case, or view a finding-derived case (AC-13). */
export type EditorMode = "create" | "manual" | "finding";

/** A case with a source finding is read-only apart from name and notes (AC-13). */
export function editorMode(c: Pick<EvalCaseDetail, "source_finding_id"> | null): EditorMode {
  if (!c) return "create";
  return c.source_finding_id ? "finding" : "manual";
}

/** A case made in the editor has no source finding and no PR. */
export function isCreatedManually(c: Pick<EvalCaseDetail, "source_finding_id" | "input_meta">): boolean {
  return !c.source_finding_id && c.input_meta.pr_number == null;
}

// ---------------------------------------------------------------------------
// Expected output (AC-19..AC-21, EC-6, EC-7, UI-1, UI-2)
// ---------------------------------------------------------------------------

/** Why the Expected output text is not valid; the UI turns it into "invalid JSON: {reason}". */
export type ExpectedProblemCode =
  | "empty"
  | "tooLarge"
  | "notJson"
  | "notArray"
  | "notOneObject"
  | "notObject"
  | "unknownKey"
  | "file"
  | "startLine"
  | "endLine"
  | "endBeforeStart"
  | "severity"
  | "category"
  | "title";

export interface ExpectedProblem {
  code: ExpectedProblemCode;
  /** The offending key (`unknownKey` only). */
  key?: string;
}

export type ParsedExpected =
  | { ok: true; expectation: ExpectationInput }
  | { ok: false; problem: ExpectedProblem };

const fail = (code: ExpectedProblemCode, key?: string): ParsedExpected => ({
  ok: false,
  problem: key === undefined ? { code } : { code, key },
});

const has = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);

/** `JSON.parse` and require an array of exactly one plain object. */
function readOnlyObject(text: string): { ok: true; item: Record<string, unknown> } | { ok: false; problem: ExpectedProblem } {
  // The cap is checked before parsing so a huge paste never reaches JSON.parse (UI-2).
  if (utf8ByteLength(text) > EXPECTED_MAX_BYTES) return { ok: false, problem: { code: "tooLarge" } };
  if (text.trim() === "") return { ok: false, problem: { code: "empty" } };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, problem: { code: "notJson" } };
  }
  if (!Array.isArray(value)) return { ok: false, problem: { code: "notArray" } };
  if (value.length !== 1) return { ok: false, problem: { code: "notOneObject" } };
  const item: unknown = value[0];
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    return { ok: false, problem: { code: "notObject" } };
  }
  return { ok: true, item: item as Record<string, unknown> };
}

const isWhole = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/**
 * The Expected output text → the expectation of the case (AC-20, UI-1).
 *
 * An array of exactly one object whose own keys are among the six of `EXPECTED_KEYS` —
 * `__proto__` and `constructor` are unknown keys like any other, so they are rejected — and
 * whose values pass the `EvalExpectationInput` rules. Only those six keys are copied, into a
 * fresh object; `type` comes from the type switch, never from the text.
 */
export function parseExpectedOutput(text: string, type: EvalExpectationType): ParsedExpected {
  const read = readOnlyObject(text);
  if (!read.ok) return read;
  const { item } = read;
  for (const key of Object.keys(item)) {
    if (!EXPECTED_KEYS.includes(key)) return fail("unknownKey", key);
  }
  const file = has(item, "file") ? item.file : undefined;
  if (typeof file !== "string" || file.length < 1 || file.length > FILE_MAX_LENGTH) return fail("file");
  const start = has(item, "start_line") ? item.start_line : undefined;
  if (!isWhole(start) || start < 1) return fail("startLine");
  const end = has(item, "end_line") ? item.end_line : undefined;
  if (!isWhole(end) || end < 1) return fail("endLine");
  if (end < start) return fail("endBeforeStart");
  const severity = has(item, "severity") ? item.severity : null;
  if (severity != null && !SEVERITIES.includes(severity as never)) return fail("severity");
  const category = has(item, "category") ? item.category : null;
  if (category != null && !CATEGORIES.includes(category as never)) return fail("category");
  const title = has(item, "title") ? item.title : null;
  if (title != null && (typeof title !== "string" || title.length > TITLE_MAX_LENGTH)) return fail("title");
  return {
    ok: true,
    expectation: {
      type,
      file,
      start_line: start,
      end_line: end,
      severity: (severity ?? null) as ExpectationInput["severity"],
      category: (category ?? null) as ExpectationInput["category"],
      title: (title ?? null) as string | null,
    },
  };
}

/** What the type banner shows while the text is being edited: the location and title of the
 *  first object when they can be read, else null (the banner then omits them). Lenient on
 *  purpose — a half-fixed expectation still tells where it points. */
export interface BannerFacts {
  file: string;
  startLine: number;
  title: string | null;
}

export function bannerFacts(text: string): BannerFacts | null {
  const read = readOnlyObject(text);
  if (!read.ok) return null;
  const { item } = read;
  const file = has(item, "file") ? item.file : null;
  const start = has(item, "start_line") ? item.start_line : null;
  if (typeof file !== "string" || file === "" || !isWhole(start)) return null;
  const title = has(item, "title") ? item.title : null;
  return { file, startLine: start, title: typeof title === "string" && title !== "" ? title : null };
}

// ---------------------------------------------------------------------------
// Validation (EC-1, EC-5, EC-6, EC-7) — a client mirror of the server's rules.
// ---------------------------------------------------------------------------

/** `required` is only shown once the field was touched; every other code shows at once. */
export type FieldProblem = "required" | "tooLong" | "tooLarge";

export type DraftField = "name" | "title" | "description" | "diff" | "notes";

export type DraftProblems = Partial<Record<DraftField, FieldProblem>>;

/** Problems of the text fields. In a finding-derived case only name and notes are editable,
 *  so only they can be wrong (the locked fields hold stored, valid values). */
export function draftProblems(draft: CaseDraft, mode: EditorMode): DraftProblems {
  const p: DraftProblems = {};
  const name = draft.name.trim();
  if (name.length === 0) p.name = "required";
  else if (name.length > NAME_MAX_LENGTH) p.name = "tooLong";
  if (draft.notes.length > NOTES_MAX_LENGTH) p.notes = "tooLong";
  if (mode === "finding") return p;

  const title = draft.title.trim();
  if (title.length === 0) p.title = "required";
  else if (title.length > TITLE_MAX_LENGTH) p.title = "tooLong";
  if (draft.description.length > DESCRIPTION_MAX_LENGTH) p.description = "tooLong";
  if (exceedsDiffLimit(draft.diff)) p.diff = "tooLarge";
  return p;
}

/** The Expected output problem that blocks a save, or null. A finding-derived case's
 *  expectation is locked, so it never blocks. */
export function expectedProblem(draft: CaseDraft, mode: EditorMode): ExpectedProblem | null {
  if (mode === "finding") return null;
  const parsed = parseExpectedOutput(draft.expected, draft.type);
  return parsed.ok ? null : parsed.problem;
}

/** Whether a problem may be shown before the user touched the field. */
export function showsBeforeTouch(problem: FieldProblem): boolean {
  return problem !== "required";
}

// ---------------------------------------------------------------------------
// Dirty check and request bodies
// ---------------------------------------------------------------------------

const emptyToNull = (text: string): string | null => (text.trim() === "" ? null : text);

/** The Expected output as the dirty check and the PATCH compare it: the parsed expectation
 *  with its keys in a fixed order, so whitespace and key order are no change (EC-8). Text
 *  that does not parse stays as typed, so half-typed input still counts as an edit. */
function expectedComparable(draft: Pick<CaseDraft, "expected" | "type">): string {
  const parsed = parseExpectedOutput(draft.expected, draft.type);
  return parsed.ok ? JSON.stringify(parsed.expectation) : `raw:${draft.expected}`;
}

/** A draft as `buildCaseUpdate` reads it: trimmed texts and the canonical expectation. */
function comparable(draft: CaseDraft) {
  return {
    name: draft.name.trim(),
    title: draft.title.trim(),
    description: emptyToNull(draft.description),
    diff: draft.diff,
    type: draft.type,
    expected: expectedComparable(draft),
    notes: emptyToNull(draft.notes),
  };
}

/** Unsaved changes (EC-8, EC-10). Compared the way `buildCaseUpdate` compares, so an edit that
 *  would send an empty PATCH (trailing space, reformatted or re-ordered JSON) is no change. */
export function isDirty(draft: CaseDraft, initial: CaseDraft): boolean {
  const a = comparable(draft);
  const b = comparable(initial);
  return (Object.keys(a) as (keyof typeof a)[]).some((k) => a[k] !== b[k]);
}

/** Whether a `PATCH` body carries anything the server would act on. */
export function hasUpdate(update: EvalCaseUpdate): boolean {
  return Object.keys(update).length > 0;
}

/** `POST …/eval-cases` and finding-route body (AC-6, AC-25). `expectation` is the parsed
 *  Expected output; only call it for a draft with no problems. */
export function buildCaseInput(draft: CaseDraft, expectation: ExpectationInput): EvalCaseInput {
  return {
    name: draft.name.trim(),
    notes: emptyToNull(draft.notes),
    input_diff: draft.diff,
    input_meta: { title: draft.title.trim(), body: emptyToNull(draft.description) },
    expectation,
  };
}

/**
 * `PATCH /eval-cases/:id` body: only the top-level keys that changed, so a rename is
 * exactly `{ name }`. `input_meta` and `expectation` go out complete when any part of them
 * changed. The server decides between update in place and replace.
 */
export function buildCaseUpdate(
  draft: CaseDraft,
  initial: CaseDraft,
  mode: EditorMode,
  expectation: ExpectationInput | null,
): EvalCaseUpdate {
  const update: EvalCaseUpdate = {};
  if (draft.name.trim() !== initial.name.trim()) update.name = draft.name.trim();
  if (draft.notes !== initial.notes) update.notes = emptyToNull(draft.notes);
  if (mode === "finding") return update;

  if (draft.diff !== initial.diff) update.input_diff = draft.diff;
  const meta = (d: CaseDraft) => JSON.stringify({ title: d.title.trim(), body: emptyToNull(d.description) });
  if (meta(draft) !== meta(initial)) update.input_meta = { title: draft.title.trim(), body: emptyToNull(draft.description) };
  if (expectation && expectedComparable(draft) !== expectedComparable(initial)) update.expectation = expectation;
  return update;
}

// ---------------------------------------------------------------------------
// Owners
// ---------------------------------------------------------------------------

/** Where an owner's Evals tab lives — the "In eval set" links (AC-5, AC-11, EC-5). */
export function ownerEvalsTabHref(owner: { kind: "agent" | "skill"; id: string }): string {
  return `/${owner.kind === "agent" ? "agents" : "skills"}/${owner.id}?tab=evals`;
}

/** A stable key of an owner, for radio values and React keys. */
export const ownerKey = (owner: { kind: string; id: string }): string => `${owner.kind}:${owner.id}`;

/** AC-5: the first owner that has no case yet, or null when every owner has one. */
export function firstFreeOwner<T extends { has_case: boolean }>(owners: readonly T[]): T | null {
  return owners.find((o) => !o.has_case) ?? null;
}

/** Who owns a case: the agent or skill whose eval set it belongs to. */
export interface CaseOwner {
  kind: "agent" | "skill";
  id: string;
}

// ---------------------------------------------------------------------------
// Running one case (SPEC-10 Phase B)
// ---------------------------------------------------------------------------

/** Why **Run case** is disabled, in the order the hints apply (AC-34, EC-19): a draft that is
 *  not stored yet, a stored case with unsaved changes, a run of the owner in progress, then a
 *  skill with no linked agent. `null` means it can run. */
export type RunCaseBlock = "draft" | "modified" | "running" | "no_agent" | null;

export function runCaseBlock(input: {
  stored: boolean;
  dirty: boolean;
  busy: boolean;
  noAgent: boolean;
}): RunCaseBlock {
  if (!input.stored) return "draft";
  if (input.dirty) return "modified";
  if (input.busy) return "running";
  if (input.noAgent) return "no_agent";
  return null;
}

/** The `eval.caseRun.hints.*` key of a disabled **Run case**. */
export const RUN_CASE_HINT_KEY = {
  draft: "draft",
  modified: "modified",
  running: "running",
  no_agent: "noAgent",
} as const satisfies Record<Exclude<RunCaseBlock, null>, string>;

/** The `{passed}/{total}` of the result banner (AC-43): `1/1` for a passed case, `0/1` for a
 *  failed one, derived from `state` with no new field; null for an errored case (omitted). */
export function bannerCount(state: "passed" | "failed" | "errored"): { passed: 1 | 0; total: 1 } | null {
  if (state === "errored") return null;
  return { passed: state === "passed" ? 1 : 0, total: 1 };
}

/** The `eval.caseRun.banner.effectLabels.*` key of a skill case's effect (AC-44). */
export function effectKey(effect: EvalCaseEffect): "helped" | "hurt" | "noEffectPass" | "noEffectFail" | "errored" {
  if (effect === "no_effect_pass") return "noEffectPass";
  if (effect === "no_effect_fail") return "noEffectFail";
  return effect;
}
