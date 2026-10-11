import type {
  EvalCaseDetail,
  EvalCaseInput,
  EvalCaseUpdate,
  EvalExpectationType,
  FindingCategory,
  PrFile,
  Severity,
} from "@devdigest/shared";
import {
  DESCRIPTION_MAX_LENGTH,
  FILE_MAX_LENGTH,
  MAX_DIFF_BYTES,
  NAME_MAX_LENGTH,
  NOTES_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "./constants";

/** +/- line counts of a unified diff. Only lines after the first hunk header count,
 *  so a `--- a/x` / `+++ b/x` file header is never mistaken for content. */
export function countPatchLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("@@")) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("+")) additions += 1;
    else if (line.startsWith("-")) deletions += 1;
  }
  return { additions, deletions };
}

/** Drops the `diff --git` / `index` / `---` / `+++` header lines before the first hunk:
 *  the shared DiffViewer's parser has no header handling and would draw them as rows.
 *  A diff with no `@@` line is returned unchanged. */
export function stripDiffHeaders(diff: string): string {
  const lines = diff.split("\n");
  const first = lines.findIndex((line) => line.startsWith("@@"));
  return first <= 0 ? diff : lines.slice(first).join("\n");
}

/** The frozen diff as the single file the shared DiffViewer renders. The viewer draws
 *  every line as escaped text, so nothing in the diff is interpreted as HTML or
 *  Markdown (UI-3). The stored `input_diff` is not modified. */
export function frozenDiffFile(c: Pick<EvalCaseDetail, "input_diff" | "expectation">): PrFile {
  const patch = stripDiffHeaders(c.input_diff);
  return { path: c.expectation.file, patch, ...countPatchLines(patch) };
}

// ---------------------------------------------------------------------------
// Pasted diff (AC-6, AC-7, AC-8) — a client mirror of the server's pasted-diff
// reading, used only to offer the file choices and to draw the preview. The server
// re-reads the diff and stays the authority (EC-2, EC-3).
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

/** New-side file paths found in the diff, first-seen order (AC-6); `[]` for bare hunks (AC-7). */
export function pastedDiffPaths(pasted: string): string[] {
  const paths: string[] = [];
  for (const section of splitPastedDiff(pasted)) {
    if (section.path && !paths.includes(section.path)) paths.push(section.path);
  }
  return paths;
}

/** Every hunk of the chosen file, headers dropped — what the preview draws (AC-8).
 *  Bare-hunk sections belong to whichever file the user typed. Empty when none. */
export function chosenFileHunks(pasted: string, file: string): string {
  const out: string[] = [];
  for (const section of splitPastedDiff(pasted)) {
    if (section.path !== null && section.path !== file) continue;
    const first = section.lines.findIndex((l) => l.startsWith(HUNK_MARKER));
    if (first >= 0) out.push(...section.lines.slice(first));
  }
  return out.join("\n").replace(/\n+$/, "");
}

/** The preview's single file, or null while the chosen file has no hunk (AC-8). */
export function previewFile(pasted: string, file: string): PrFile | null {
  const patch = chosenFileHunks(pasted, file);
  if (!patch) return null;
  return { path: file, patch, ...countPatchLines(patch) };
}

/**
 * The file the case is about: one of the diff's new-side paths (the first until the
 * user picks another that is still in the diff, AC-6), or the typed path when the
 * diff holds bare hunks (AC-7).
 */
export function resolveFile(pasted: string, chosen: string): { paths: string[]; file: string } {
  const paths = pastedDiffPaths(pasted);
  if (paths.length === 0) return { paths, file: chosen.trim() };
  return { paths, file: paths.includes(chosen) ? chosen : (paths[0] ?? "") };
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

/** What the editor shows. Strings throughout so a half-typed number is representable. */
export interface CaseDraft {
  name: string;
  title: string;
  description: string;
  diff: string;
  file: string;
  type: EvalExpectationType;
  start: string;
  end: string;
  severity: Severity | "";
  category: FindingCategory | "";
  notes: string;
}

/** AC-5: every field empty except the type, `must_find`. */
export function emptyDraft(): CaseDraft {
  return {
    name: "",
    title: "",
    description: "",
    diff: "",
    file: "",
    type: "must_find",
    start: "",
    end: "",
    severity: "",
    category: "",
    notes: "",
  };
}

/** AC-13: prefilled with the stored case. */
export function draftFromCase(c: EvalCaseDetail): CaseDraft {
  const e = c.expectation;
  return {
    name: c.name,
    title: c.input_meta.title,
    description: c.input_meta.body ?? "",
    diff: c.input_diff,
    file: e.file,
    type: e.type,
    start: String(e.start_line),
    end: String(e.end_line),
    severity: (e.severity ?? "") as Severity | "",
    category: (e.category ?? "") as FindingCategory | "",
    notes: c.notes ?? "",
  };
}

/** Create, edit a manual case, or view a finding-derived case (EC-7). */
export type EditorMode = "create" | "manual" | "finding";

/** A case with a source finding is read-only apart from name and notes (EC-6, EC-7). */
export function editorMode(c: Pick<EvalCaseDetail, "source_finding_id"> | null): EditorMode {
  if (!c) return "create";
  return c.source_finding_id ? "finding" : "manual";
}

/** AC-19: a case made in the editor has no source finding and no PR. */
export function isCreatedManually(c: Pick<EvalCaseDetail, "source_finding_id" | "input_meta">): boolean {
  return !c.source_finding_id && c.input_meta.pr_number == null;
}

/** `"12"` → 12; anything that is not a whole number of 1 or more → null (EC-4). */
export function parseLine(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/** The new-side range the preview highlights, or null while the lines are not valid (AC-8). */
export function highlightRangeOf(draft: Pick<CaseDraft, "start" | "end">): { start: number; end: number } | null {
  const start = parseLine(draft.start);
  const end = parseLine(draft.end);
  return start !== null && end !== null && end >= start ? { start, end } : null;
}

// ---------------------------------------------------------------------------
// Validation (EC-1, EC-4, EC-5) — a client mirror of the server's rules.
// ---------------------------------------------------------------------------

/** `required` is only shown once the field was touched; every other code shows at once. */
export type FieldProblem =
  | "required"
  | "tooLong"
  | "tooLarge"
  | "lineInvalid"
  | "endBeforeStart";

export type DraftField = "name" | "title" | "description" | "diff" | "file" | "start" | "end" | "notes";

export type DraftProblems = Partial<Record<DraftField, FieldProblem>>;

/** Problems of the draft. In a finding-derived case only name and notes are editable,
 *  so only they can be wrong (the locked fields hold stored, valid values). */
export function draftProblems(draft: CaseDraft, mode: EditorMode, file: string): DraftProblems {
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
  if (file.length === 0) p.file = "required";
  else if (file.length > FILE_MAX_LENGTH) p.file = "tooLong";

  const start = parseLine(draft.start);
  const end = parseLine(draft.end);
  if (draft.start.trim() === "") p.start = "required";
  else if (start === null) p.start = "lineInvalid";
  if (draft.end.trim() === "") p.end = "required";
  else if (end === null) p.end = "lineInvalid";
  else if (start !== null && end < start) p.end = "endBeforeStart";
  return p;
}

/** Whether a problem may be shown before the user touched the field. */
export function showsBeforeTouch(problem: FieldProblem): boolean {
  return problem !== "required";
}

// ---------------------------------------------------------------------------
// Dirty check and request bodies
// ---------------------------------------------------------------------------

const emptyToNull = (text: string): string | null => (text.trim() === "" ? null : text);

/** A draft as `buildCaseUpdate` reads it: trimmed texts, parsed line numbers, the resolved
 *  file, and no severity/category on `must_not_flag` (EC-41). A line that does not parse
 *  stays as typed, so half-typed input still counts as an edit. */
function comparable(draft: CaseDraft) {
  const mustFind = draft.type === "must_find";
  return {
    name: draft.name.trim(),
    title: draft.title.trim(),
    description: emptyToNull(draft.description),
    diff: draft.diff,
    file: resolveFile(draft.diff, draft.file).file,
    type: draft.type,
    start: parseLine(draft.start) ?? draft.start.trim(),
    end: parseLine(draft.end) ?? draft.end.trim(),
    severity: mustFind ? draft.severity : "",
    category: mustFind ? draft.category : "",
    notes: emptyToNull(draft.notes),
  };
}

/** Unsaved changes (EC-8). Compared the way `buildCaseUpdate` compares, so an edit that
 *  would send an empty PATCH (trailing space, "5" → "05", a re-picked identical file) is no change. */
export function isDirty(draft: CaseDraft, initial: CaseDraft): boolean {
  const a = comparable(draft);
  const b = comparable(initial);
  return (Object.keys(a) as (keyof typeof a)[]).some((k) => a[k] !== b[k]);
}

/** Whether a `PATCH` body carries anything the server would act on. */
export function hasUpdate(update: EvalCaseUpdate): boolean {
  return Object.keys(update).length > 0;
}
/** Severity and category are only kept for `must_find` (EC-41). */
function expectationOf(draft: CaseDraft, file: string): EvalCaseInput["expectation"] {
  const mustFind = draft.type === "must_find";
  return {
    type: draft.type,
    file,
    start_line: parseLine(draft.start) ?? 0,
    end_line: parseLine(draft.end) ?? 0,
    severity: mustFind && draft.severity ? draft.severity : null,
    category: mustFind && draft.category ? draft.category : null,
  };
}

/** `POST …/eval-cases` body (AC-9, AC-45). Only call it for a draft with no problems. */
export function buildCaseInput(draft: CaseDraft, file: string): EvalCaseInput {
  return {
    name: draft.name.trim(),
    notes: emptyToNull(draft.notes),
    input_diff: draft.diff,
    input_meta: { title: draft.title.trim(), body: emptyToNull(draft.description) },
    expectation: expectationOf(draft, file),
  };
}

/**
 * `PATCH /eval-cases/:id` body: only the top-level keys that changed, so a rename
 * is exactly `{ name }` (AC-14). `input_meta` and `expectation` go out complete when any
 * part of them changed. The server decides between update in place and replace.
 */
export function buildCaseUpdate(
  draft: CaseDraft,
  initial: CaseDraft,
  mode: EditorMode,
  file: string,
): EvalCaseUpdate {
  const update: EvalCaseUpdate = {};
  if (draft.name.trim() !== initial.name.trim()) update.name = draft.name.trim();
  if (draft.notes !== initial.notes) update.notes = emptyToNull(draft.notes);
  if (mode === "finding") return update;

  const before = buildCaseInput(initial, resolveFile(initial.diff, initial.file).file);
  const after = buildCaseInput(draft, file);
  if (draft.diff !== initial.diff) update.input_diff = draft.diff;
  if (JSON.stringify(after.input_meta) !== JSON.stringify(before.input_meta)) update.input_meta = after.input_meta;
  if (JSON.stringify(after.expectation) !== JSON.stringify(before.expectation)) update.expectation = after.expectation;
  return update;
}
