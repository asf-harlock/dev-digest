import type { FileRef } from "@devdigest/shared";

/**
 * Client-local copy of `parseFileRef` / `formatFileRef` from the shared
 * `contracts/brief.ts`.
 *
 * The client can only import TYPES from the vendored shared package —
 * importing a runtime VALUE pulls `vendor/shared/index.ts` into the webpack
 * bundle, whose `./contracts/*.js` re-exports Next's webpack can't resolve
 * (same reason as `feature-models.ts`). Keep this in sync with the shared
 * copy; `file-ref.test.ts` pins both against the same vectors.
 */

const FILE_REF_RE = /^(.+):(\d+)(?:-(\d+))?$/;

/** Split a file ref. A suffix that is not a valid 1-based range (zero, or end
 *  before start) is not a range: the whole string stays the path. */
export function parseFileRef(ref: string): FileRef {
  const m = FILE_REF_RE.exec(ref);
  if (!m) return { path: ref, start: null, end: null };
  const start = Number(m[2]);
  const end = m[3] === undefined ? null : Number(m[3]);
  if (!Number.isSafeInteger(start) || start < 1) return { path: ref, start: null, end: null };
  if (end !== null && (!Number.isSafeInteger(end) || end < start)) {
    return { path: ref, start: null, end: null };
  }
  return { path: m[1] as string, start, end: end === start ? null : end };
}

export function formatFileRef(path: string, start?: number | null, end?: number | null): string {
  if (start == null || !Number.isInteger(start) || start < 1) return path;
  if (end == null || !Number.isInteger(end) || end <= start) return `${path}:${start}`;
  return `${path}:${start}-${end}`;
}
