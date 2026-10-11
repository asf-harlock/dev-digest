import type { Finding, FindingKind } from '@devdigest/shared';
import { groundFindings } from '@devdigest/reviewer-core';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { DIFF_FILE_MARKER, DIFF_HUNK_MARKER, EVAL_ERROR } from './constants.js';

/**
 * SPEC-08 frozen case input — pure, no I/O, no LLM.
 *
 * A case freezes the unified diff of ONE file of the PR (AC-4). The section is
 * cut out of the raw diff by an exact path match on the `+++ b/<path>` /
 * `diff --git` header. `reviewer-core`'s `sliceDiff` is deliberately NOT used:
 * its fuzzy `includes` match and its "fall back to the whole diff" behaviour
 * would freeze other files into the case.
 */

/** A `pr_files.patch` is hunks only; wrap it in headers so it parses like `git diff` output. */
export function rawDiffFromPrFiles(files: { path: string; patch: string | null }[]): string {
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch);
  }
  return parts.join('\n');
}

/** New-side path of one `diff --git` section, or null when it cannot be told. */
function sectionPath(lines: string[]): string | null {
  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).replace(/^b\//, '').trim();
      if (p !== '/dev/null') return p;
      break;
    }
    if (line.startsWith(DIFF_HUNK_MARKER)) break;
  }
  const header = lines[0]?.match(/^diff --git a\/.+ b\/(.+)$/);
  return header?.[1]?.trim() ?? null;
}

/**
 * The exact `diff --git` … section of `path`: headers plus every hunk. Returns
 * null when the file is not in the diff or its section has no hunk (binary,
 * pure rename, too large for GitHub to give a patch).
 */
export function extractFileDiff(rawDiff: string, path: string): string | null {
  const lines = rawDiff.split('\n');
  const sections: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith(DIFF_FILE_MARKER)) {
      current = [line];
      sections.push(current);
    } else if (current) {
      current.push(line);
    }
  }
  for (const section of sections) {
    if (sectionPath(section) !== path) continue;
    if (!section.some((l) => l.startsWith(DIFF_HUNK_MARKER))) return null;
    while (section.length > 0 && section[section.length - 1] === '') section.pop();
    return section.join('\n');
  }
  return null;
}

export type FreezeResult =
  | { ok: true; diff: string }
  | { ok: false; reason: typeof EVAL_ERROR.noPatch | typeof EVAL_ERROR.rangeOutsideDiff };

export interface FreezeTarget {
  file: string;
  start_line: number;
  end_line: number;
  /** The source finding's `kind`; full-file kinds only need the file to be present (EC-6). */
  kind?: string | null;
}

/**
 * Freeze `target.file`'s diff out of the PR's raw diff and check that the
 * expectation can ever be matched: its range must intersect a hunk's new-side
 * lines (EC-5). That check REUSES `groundFindings` — never a second definition
 * of what a valid citation is.
 */
export function freezeFileDiff(rawDiff: string, target: FreezeTarget): FreezeResult {
  const diff = extractFileDiff(rawDiff, target.file);
  if (diff === null) return { ok: false, reason: EVAL_ERROR.noPatch };
  const parsed = parseUnifiedDiff(diff);
  if (parsed.files.length === 0) return { ok: false, reason: EVAL_ERROR.noPatch };

  const probe: Finding = {
    id: 'eval-expectation-check',
    severity: 'WARNING',
    category: 'bug',
    title: 'eval expectation',
    file: target.file,
    start_line: target.start_line,
    end_line: target.end_line,
    rationale: '',
    confidence: 1,
    // A stored kind outside the enum behaves as a plain finding in `groundFindings`.
    kind: (target.kind ?? 'finding') as FindingKind,
  };
  const { kept } = groundFindings([probe], parsed);
  if (kept.length === 0) return { ok: false, reason: EVAL_ERROR.rangeOutsideDiff };
  return { ok: true, diff };
}
