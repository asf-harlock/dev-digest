/**
 * Project Context (SPEC-04) — pure path rules shared by `context`, `agents`,
 * `skills` and the run executor. Lives in `_shared/` because
 * `no-cross-module-import` forbids one module reaching into another's files,
 * and all four need the same glob matcher and path validation.
 *
 * GLOB SUBSET (deliberately tiny, no dependency):
 *   - `**` + `/`  zero or more whole directories (so a leading one also matches
 *                 a file at the repo root: `docs/a.md`)
 *   - `**` else   any characters, `/` included
 *   - `*`         any characters except `/`
 *   - `{a,b}`     alternation (one level, no nesting)
 *   Everything else is a literal. There is NO `?`, character class or negation.
 *   Matching is case-sensitive over `/`-separated repo-relative paths.
 */

/** Largest document that can be attached to an agent or skill (64 KB — same as PR context). */
export const MAX_CONTEXT_FILE_BYTES = 64 * 1024;
/**
 * Largest document the preview route reads. Above `MAX_CONTEXT_FILE_BYTES` a
 * document is still previewable but stays `attachable: false` / `too_large`.
 */
export const MAX_CONTEXT_PREVIEW_BYTES = 256 * 1024;
/** Most files a listing returns (the rest are counted in `total`). */
export const MAX_CONTEXT_LISTING_FILES = 500;
/** Cap on the wrapped project-context block sent to the model, in tokens. */
export const PROJECT_CONTEXT_TOKEN_BUDGET = 16_000;
/** SPEC-07: cap on the wrapped PR-context block, in tokens. */
export const PR_CONTEXT_TOKEN_BUDGET = 10_000;
/** SPEC-07: a document is truncated only while at least this many tokens remain. */
export const PR_CONTEXT_TRUNCATION_FLOOR = 500;
/** SPEC-07: largest PR-context document read from git (64 KB). */
export const PR_CONTEXT_MAX_FILE_BYTES = 64 * 1024;
/** SPEC-07: timeout for the fetch of a PR head commit. */
export const PR_CONTEXT_FETCH_TIMEOUT_MS = 30_000;
/** SPEC-07: most documents attachable to one PR. */
export const MAX_PR_CONTEXT_PATHS = 20;
/** Times a file is re-read while checking it was not modified mid-read. */
export const MAX_READ_ATTEMPTS = 2;
/** Longest accepted attachment path. */
export const MAX_CONTEXT_PATH_LENGTH = 512;
/** Longest path echoed into a log line. */
export const MAX_LOGGED_PATH_LENGTH = 200;

export const CONTEXT_KINDS = ['specs', 'docs', 'insights'] as const;
export type ContextKind = (typeof CONTEXT_KINDS)[number];
/** Kind for a path with no `specs`/`docs`/`insights` directory (custom globs). */
export const DEFAULT_CONTEXT_KIND: ContextKind = 'docs';

const REQUIRED_EXTENSION = '.md';
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_GLOBAL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
const WINDOWS_DRIVE = /^[A-Za-z]:/;
const REGEX_SPECIALS = /[.+^$()|[\]\\?]/;

const globCache = new Map<string, RegExp>();

/** Compile one glob of the documented subset to an anchored RegExp. */
export function globToRegExp(glob: string): RegExp {
  const cached = globCache.get(glob);
  if (cached) return cached;
  let re = '';
  let inBrace = false;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:[^/]+/)*';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '{' && !inBrace) {
      re += '(?:';
      inBrace = true;
    } else if (c === '}' && inBrace) {
      re += ')';
      inBrace = false;
    } else if (c === ',' && inBrace) {
      re += '|';
    } else {
      re += REGEX_SPECIALS.test(c) ? `\\${c}` : c;
    }
  }
  if (inBrace) throw new Error(`Unbalanced "{" in context glob: ${glob}`);
  const compiled = new RegExp(`^${re}$`);
  globCache.set(glob, compiled);
  return compiled;
}

export function matchesAnyGlob(path: string, globs: readonly string[]): boolean {
  return globs.some((g) => globToRegExp(g).test(path));
}

/** True when any directory segment of `path` is an excluded directory name. */
export function isExcludedPath(path: string, excludes: readonly string[]): boolean {
  const segments = path.split('/');
  segments.pop(); // the file name itself is not a directory
  return segments.some((s) => excludes.includes(s));
}

/** True when a bare directory name is excluded (used while walking the tree). */
export function isExcludedDirName(name: string, excludes: readonly string[]): boolean {
  return excludes.includes(name);
}

export type PathCheck = { ok: true } | { ok: false; reason: string };

/**
 * Shape-only check: a relative, `/`-separated path with no empty, `.` or `..`
 * segments, no control characters, no backslash, no drive letter. Applied at
 * run/preview time on stored paths (UI-2) on top of the realpath check.
 */
export function checkRelativeShape(path: unknown): PathCheck {
  if (typeof path !== 'string' || path.length === 0) return { ok: false, reason: 'path is empty' };
  if (path.length > MAX_CONTEXT_PATH_LENGTH) return { ok: false, reason: 'path is too long' };
  if (CONTROL_CHARS.test(path)) return { ok: false, reason: 'path contains control characters' };
  if (path.includes('\\')) return { ok: false, reason: 'path must use "/" separators' };
  if (path.startsWith('/') || WINDOWS_DRIVE.test(path)) {
    return { ok: false, reason: 'path must be relative' };
  }
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') {
      return { ok: false, reason: 'path must not contain empty, "." or ".." segments' };
    }
  }
  return { ok: true };
}

export interface ContextRules {
  globs: readonly string[];
  excludes: readonly string[];
}

/**
 * UI-1: an attachment path is accepted only if it is a clean relative path,
 * ends in `.md`, matches the configured globs and sits outside the excluded
 * directories. Needs no repo, so agents/skills can validate on save.
 */
export function validateContextPath(path: unknown, rules: ContextRules): PathCheck {
  const shape = checkRelativeShape(path);
  if (!shape.ok) return shape;
  const p = path as string;
  if (!p.endsWith(REQUIRED_EXTENSION)) return { ok: false, reason: 'path must end in .md' };
  if (isExcludedPath(p, rules.excludes)) {
    return { ok: false, reason: 'path is inside an excluded directory' };
  }
  if (!matchesAnyGlob(p, rules.globs)) {
    return { ok: false, reason: 'path does not match the project-context globs' };
  }
  return { ok: true };
}

/** First invalid path in a list, with its reason; undefined when all are valid. */
export function firstInvalidContextPath(
  paths: readonly string[],
  rules: ContextRules,
): { path: string; reason: string } | undefined {
  for (const p of paths) {
    const check = validateContextPath(p, rules);
    if (!check.ok) return { path: sanitizePathForLog(p), reason: check.reason };
  }
  return undefined;
}

/** Order-preserving de-dupe keeping the first occurrence. */
export function dedupePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

/** Same paths in the same order. */
export function samePathList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

/**
 * `kind` = the `specs` / `docs` / `insights` directory nearest to the file
 * name; `docs` when none of the directories is one of those.
 */
export function kindForPath(path: string): ContextKind {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i--) {
    const seg = dirs[i]!;
    if ((CONTEXT_KINDS as readonly string[]).includes(seg)) return seg as ContextKind;
  }
  return DEFAULT_CONTEXT_KIND;
}

/**
 * UI-7: a document path echoed into a run-log line or server log. Control
 * characters and newlines are replaced so a crafted file name cannot forge
 * log lines; long names are truncated.
 */
export function sanitizePathForLog(path: string): string {
  const clean = path.replace(CONTROL_CHARS_GLOBAL, '?');
  return clean.length > MAX_LOGGED_PATH_LENGTH
    ? `${clean.slice(0, MAX_LOGGED_PATH_LENGTH)}…`
    : clean;
}

/** The `source` label a document carries inside its `<untrusted>` block. */
export function projectContextLabel(path: string): string {
  return `project-context:${path}`;
}
