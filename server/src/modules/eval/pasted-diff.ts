import {
  DIFF_DEV_NULL,
  DIFF_FILE_MARKER,
  DIFF_HUNK_MARKER,
  DIFF_NEW_FILE_PREFIX,
  DIFF_OLD_FILE_PREFIX,
  MAX_DIFF_BYTES,
} from './constants.js';
import { extractFileDiff, freezeFileDiff, type FreezeResult, type FreezeTarget } from './frozen-input.js';

/**
 * SPEC-09 pasted-diff handling for the Case Editor — pure, no I/O, no LLM.
 *
 * A user pastes either a full unified diff (`diff --git` or `---`/`+++`
 * headers, one or many files) or bare hunks (`@@ … @@`, one file whose path
 * is typed separately). `canonicalizeDiff` turns any of those into `git diff`
 * shape; the chosen file's section is then cut out and grounded by the SAME
 * `freezeFileDiff` the finding path uses, so there is one definition of a
 * valid citation. `extractFileDiff` itself is untouched.
 */

/** UTF-8 byte length — the unit of the 200 KB cap (EC-1). */
export function utf8ByteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

/** EC-1: true when the pasted text is over the cap. Called BEFORE any parsing. */
export function exceedsDiffLimit(text: string): boolean {
  return utf8ByteLength(text) > MAX_DIFF_BYTES;
}

/** AC-46: every CRLF (and a lone CR) becomes LF. */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** A path from a `---` / `+++` header line: drop the `a/` / `b/` prefix and a trailing tab-timestamp. */
function headerPath(line: string, prefixLen: number, side: 'a' | 'b'): string | null {
  const raw = (line.slice(prefixLen).split('\t')[0] ?? '').trim();
  if (raw === '' || raw === DIFF_DEV_NULL) return null;
  return raw.startsWith(`${side}/`) ? raw.slice(2) : raw;
}

interface HeaderlessSection {
  oldPath: string | null;
  newPath: string | null;
  body: string[];
}

/** `--- X` is a header (not a removed `-- X` line) only when `+++ Y` and `@@` follow. */
function isOldHeaderAt(lines: string[], i: number): boolean {
  return (
    (lines[i] ?? '').startsWith(DIFF_OLD_FILE_PREFIX) &&
    (lines[i + 1] ?? '').startsWith(DIFF_NEW_FILE_PREFIX) &&
    (lines[i + 2] ?? '').startsWith(DIFF_HUNK_MARKER)
  );
}

/** A bare `+++ Y` header followed by a hunk. */
function isNewHeaderAt(lines: string[], i: number): boolean {
  return (
    (lines[i] ?? '').startsWith(DIFF_NEW_FILE_PREFIX) &&
    (lines[i + 1] ?? '').startsWith(DIFF_HUNK_MARKER)
  );
}

/** Split text with no `diff --git` marker into per-file sections. */
function splitHeaderless(lines: string[]): HeaderlessSection[] {
  const sections: HeaderlessSection[] = [];
  let current: HeaderlessSection | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (isOldHeaderAt(lines, i)) {
      current = {
        oldPath: headerPath(line, DIFF_OLD_FILE_PREFIX.length, 'a'),
        newPath: headerPath(lines[i + 1] ?? '', DIFF_NEW_FILE_PREFIX.length, 'b'),
        body: [],
      };
      sections.push(current);
      i += 1; // consume the `+++` line
      continue;
    }
    if (isNewHeaderAt(lines, i)) {
      current = {
        oldPath: null,
        newPath: headerPath(line, DIFF_NEW_FILE_PREFIX.length, 'b'),
        body: [],
      };
      sections.push(current);
      continue;
    }
    if (current) {
      current.body.push(line);
    } else if (line.startsWith(DIFF_HUNK_MARKER)) {
      // Hunks with no file header: one file whose path the caller supplies.
      current = { oldPath: null, newPath: null, body: [line] };
      sections.push(current);
    }
  }
  return sections;
}

/**
 * Pasted text → `git diff` shape (AC-6, AC-7, AC-10). Text that already has
 * `diff --git` markers is kept as is (anything before the first marker is
 * dropped). Otherwise each section gets generated headers; a section with no
 * path of its own (bare hunks) takes `fallbackFile`.
 */
export function canonicalizeDiff(pasted: string, fallbackFile: string): string {
  const text = normalizeNewlines(pasted);
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.startsWith(DIFF_FILE_MARKER));
  if (first >= 0) return lines.slice(first).join('\n');

  const parts: string[] = [];
  for (const section of splitHeaderless(lines)) {
    const path = section.newPath ?? section.oldPath ?? (fallbackFile.trim() || null);
    if (!path) continue;
    parts.push(`${DIFF_FILE_MARKER}a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`);
    parts.push(...section.body);
  }
  return parts.join('\n');
}

/** New-side file paths found in a pasted diff, first-seen order (AC-6); `[]` for bare hunks. */
export function pastedDiffPaths(pasted: string): string[] {
  const lines = normalizeNewlines(pasted).split('\n');
  const paths: string[] = [];
  const add = (p: string | null) => {
    if (p && !paths.includes(p)) paths.push(p);
  };
  if (lines.some((l) => l.startsWith(DIFF_FILE_MARKER))) {
    let header: string | null = null;
    for (const line of lines) {
      if (line.startsWith(DIFF_FILE_MARKER)) {
        add(header);
        header = line.match(/^diff --git a\/.+ b\/(.+)$/)?.[1]?.trim() ?? null;
      } else if (line.startsWith(DIFF_NEW_FILE_PREFIX)) {
        const p = headerPath(line, DIFF_NEW_FILE_PREFIX.length, 'b');
        if (p) header = p;
      }
    }
    add(header);
    return paths;
  }
  for (const s of splitHeaderless(lines)) add(s.newPath);
  return paths;
}

/**
 * AC-10, EC-2, EC-3: the chosen file's section (headers + every hunk) of the
 * pasted diff, and the check that the expectation's new-side range can match.
 */
export function freezePastedDiff(pasted: string, target: FreezeTarget): FreezeResult {
  return freezeFileDiff(canonicalizeDiff(pasted, target.file), target);
}

/**
 * Whether a pasted diff stands for the stored section of `file` — a pasted
 * multi-file diff echoing the stored case back is NOT a change (AC-14).
 */
export function diffUnchanged(stored: string, pasted: string, file: string): boolean {
  const trimmed = (s: string) => normalizeNewlines(s).replace(/\n+$/, '');
  if (trimmed(pasted) === trimmed(stored)) return true;
  const section = extractFileDiff(canonicalizeDiff(pasted, file), file);
  return section !== null && trimmed(section) === trimmed(stored);
}
