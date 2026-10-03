/**
 * PR Context (SPEC-07) — pure path rules and the suggestion matcher. No I/O.
 */
import {
  isExcludedPath,
  kindForPath,
  validateContextPath,
  type ContextRules,
  type PathCheck,
} from './context-paths.js';

/**
 * UI-1: every client-supplied path (PUT body entries, preview `path` query).
 * The SPEC-04 rules plus "first character is not `:`" (git pathspec magic).
 */
export function validatePrContextPath(path: unknown, rules: ContextRules): PathCheck {
  if (typeof path === 'string' && path.startsWith(':')) {
    return { ok: false, reason: 'path must not start with ":"' };
  }
  return validateContextPath(path, rules);
}

/** A `.md` file inside a `specs` directory. */
export function isSpecsDocPath(path: string): boolean {
  return path.endsWith('.md') && kindForPath(path) === 'specs';
}

export type PrContextAttachableOrigin = 'added' | 'modified' | 'default_branch';

export interface ChangedFile {
  path: string;
  /** `pr_files.status`: added | modified | removed | renamed. */
  status: string;
}

/**
 * Origin of a path from the PR's changed files. A removed file does not exist
 * at the head SHA, so it is not a head copy: it falls back to `default_branch`.
 * `renamed` and `modified` both read as `modified`.
 */
export function originFor(
  path: string,
  changed: ReadonlyMap<string, string>,
): PrContextAttachableOrigin {
  const status = changed.get(path);
  if (status === undefined || status === 'removed') return 'default_branch';
  return status === 'added' ? 'added' : 'modified';
}

/** path -> status map of the changed files. */
export function changedStatusMap(files: readonly ChangedFile[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.status]));
}

export interface AttachableItem {
  path: string;
  kind: ReturnType<typeof kindForPath>;
  origin: PrContextAttachableOrigin;
}

/**
 * AC-3: the default-branch listing plus every changed `.md` file that passes
 * the path rules (UI-1). A path in both takes its added/modified origin (the
 * head copy wins). A removed file is not attachable: it is absent at head.
 * Sorted by path.
 */
export function buildAttachableList(
  defaultBranchPaths: readonly string[],
  changedFiles: readonly ChangedFile[],
  rules: ContextRules,
): AttachableItem[] {
  const changed = changedStatusMap(
    changedFiles.filter(
      (f) =>
        f.status !== 'removed' && !isExcludedPath(f.path, rules.excludes) && validatePrContextPath(f.path, rules).ok,
    ),
  );
  const all = new Set<string>([...defaultBranchPaths, ...changed.keys()]);
  return [...all]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((path) => ({
      path,
      kind: kindForPath(path),
      origin: originFor(path, changed),
    }));
}

/** Longest text scanned for references (title + description + branch). */
const MAX_REFERENCE_TEXT = 20_000;
const MAX_REFERENCES = 20;

/**
 * UI-11: extract only `SPEC-NN` and `specs/NN-…` tokens. Returns distinct
 * numbers in first-seen order, each with the token that produced it.
 */
export function extractSpecReferences(text: string): { number: number; token: string }[] {
  const src = text.slice(0, MAX_REFERENCE_TEXT);
  const found: { number: number; token: string; index: number }[] = [];
  for (const m of src.matchAll(/\bSPEC-(\d{1,4})\b/gi)) {
    found.push({ number: Number(m[1]), token: `SPEC-${m[1]}`, index: m.index ?? 0 });
  }
  for (const m of src.matchAll(/\bspecs\/(\d{1,4})-/gi)) {
    found.push({ number: Number(m[1]), token: `specs/${m[1]}-…`, index: m.index ?? 0 });
  }
  found.sort((a, b) => a.index - b.index);
  const seen = new Set<number>();
  const out: { number: number; token: string }[] = [];
  for (const f of found) {
    if (seen.has(f.number)) continue;
    seen.add(f.number);
    out.push({ number: f.number, token: f.token });
    if (out.length >= MAX_REFERENCES) break;
  }
  return out;
}

/** The numeric prefix `NN-` of a spec file name, or null. */
function specNumberOfFile(path: string): number | null {
  const name = path.split('/').pop() ?? '';
  const m = /^(\d+)-/.exec(name);
  return m ? Number(m[1]) : null;
}

export interface PrContextSuggestionItem {
  path: string;
  reason: string;
}

export interface SuggestionInput {
  attachable: readonly AttachableItem[];
  attached: readonly string[];
  /** Paths of the PR's changed files. */
  changedPaths: readonly string[];
  title: string;
  body: string | null;
  branch: string;
}

/**
 * AC-10 / AC-11 / EC-26: suggestions are not-attached attachable paths that are
 * a changed `specs/**.md`, or that a `SPEC-NN` / `specs/NN-…` reference in the
 * title, description or branch resolves to. An unresolved reference adds
 * nothing. Changed-file suggestions come first, then references in order.
 */
export function computeSuggestions(input: SuggestionInput): PrContextSuggestionItem[] {
  const attached = new Set(input.attached);
  const attachable = new Set(input.attachable.map((a) => a.path));
  const out = new Map<string, string>();

  for (const p of input.changedPaths) {
    if (attached.has(p) || !attachable.has(p) || !isSpecsDocPath(p)) continue;
    out.set(p, 'Spec changed in this PR');
  }
  const refs = extractSpecReferences(`${input.title}\n${input.body ?? ''}\n${input.branch}`);
  for (const ref of refs) {
    for (const item of input.attachable) {
      if (attached.has(item.path) || out.has(item.path)) continue;
      if (!isSpecsDocPath(item.path) || specNumberOfFile(item.path) !== ref.number) continue;
      out.set(item.path, `Referenced as ${ref.token} in the PR`);
    }
  }
  return [...out].map(([path, reason]) => ({ path, reason }));
}
