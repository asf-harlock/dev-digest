import { describe, it, expect } from 'vitest';
import { EVAL_ERROR, MAX_DIFF_BYTES } from './constants.js';
import {
  canonicalizeDiff,
  diffUnchanged,
  exceedsDiffLimit,
  freezePastedDiff,
  normalizeNewlines,
  pastedDiffPaths,
  utf8ByteLength,
} from './pasted-diff.js';

/**
 * SPEC-09 pasted-diff handling for the Case Editor — pure, no I/O, no LLM.
 * Secrets in fixtures are placeholders only.
 */

/** Hunk body: new-side lines 10..13 (10 ctx, 11 added, 12-13 ctx). */
const HUNK = ['@@ -10,3 +10,4 @@', '   port: 3000,', '+  stripeKey: "sk_live_xxx",', '   redisUrl: x,', '   end: 1,'].join('\n');
const OTHER_HUNK = ['@@ -1,2 +1,3 @@', ' const a = 1;', '+const b = 2;', ' export {};'].join('\n');

const FULL = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  HUNK,
  'diff --git a/src/other.ts b/src/other.ts',
  '--- a/src/other.ts',
  '+++ b/src/other.ts',
  OTHER_HUNK,
].join('\n');

const target = (file: string, start: number, end = start) => ({ file, start_line: start, end_line: end });

describe('EC-1: 204,800-byte cap (utf8 bytes, not characters)', () => {
  it('EC-1: exactly 204,800 bytes is allowed, one more is over', () => {
    expect(MAX_DIFF_BYTES).toBe(204_800);
    expect(exceedsDiffLimit('a'.repeat(204_800))).toBe(false);
    expect(exceedsDiffLimit('a'.repeat(204_801))).toBe(true);
  });

  it('EC-1: counts UTF-8 bytes, so fewer multi-byte characters can still be over the cap', () => {
    const twoByte = 'é'.repeat(102_401); // 102,401 chars = 204,802 bytes
    expect(twoByte.length).toBeLessThan(MAX_DIFF_BYTES);
    expect(utf8ByteLength(twoByte)).toBe(204_802);
    expect(exceedsDiffLimit(twoByte)).toBe(true);
    expect(exceedsDiffLimit('é'.repeat(102_400))).toBe(false);
  });

  it('EC-1: the cap check needs no parsing — an oversize non-diff blob is still over', () => {
    expect(exceedsDiffLimit('x'.repeat(204_801))).toBe(true);
  });
});

describe('AC-46: CRLF → LF', () => {
  it('AC-46: CRLF and a lone CR both become LF', () => {
    expect(normalizeNewlines('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  });

  it('AC-46: a CRLF paste freezes to an LF-only diff and still grounds', () => {
    const crlf = FULL.replace(/\n/g, '\r\n');
    const res = freezePastedDiff(crlf, target('src/config.ts', 11));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.diff).not.toContain('\r');
      expect(res.diff).toContain('sk_live_xxx');
    }
  });
});

describe('AC-6 / AC-7: header wrapping', () => {
  it('AC-6: hunks-only input gets git headers built from the typed file path', () => {
    const out = canonicalizeDiff(HUNK, 'src/config.ts');
    expect(out.split('\n').slice(0, 3)).toEqual([
      'diff --git a/src/config.ts b/src/config.ts',
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
    ]);
    expect(out).toContain(HUNK);
  });

  it('AC-6: hunks-only input freezes and grounds against the typed file', () => {
    const res = freezePastedDiff(HUNK, target('src/config.ts', 11));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.diff.startsWith('diff --git a/src/config.ts b/src/config.ts')).toBe(true);
  });

  it('AC-6: a `+++`-only paste (no `diff --git`, no `---`) takes its path from the `+++` line, not the typed one', () => {
    const out = canonicalizeDiff(`+++ b/src/config.ts\n${HUNK}`, 'ignored.ts');
    expect(out).toContain('diff --git a/src/config.ts b/src/config.ts');
    expect(out).toContain('--- a/src/config.ts');
    expect(out).not.toContain('ignored.ts');
    expect(freezePastedDiff(`+++ b/src/config.ts\n${HUNK}`, target('src/config.ts', 11)).ok).toBe(true);
  });

  it('AC-6: a `---`/`+++` pair without `diff --git` is wrapped too', () => {
    const out = canonicalizeDiff(`--- a/src/config.ts\n+++ b/src/config.ts\n${HUNK}`, 'x.ts');
    expect(out.startsWith('diff --git a/src/config.ts b/src/config.ts')).toBe(true);
  });

  it('AC-6: an existing `diff --git` paste is kept as is, dropping text before the first marker', () => {
    expect(canonicalizeDiff(`some preamble\n${FULL}`, 'x.ts')).toBe(FULL);
  });

  it('AC-6: no `diff --git`, no hunk and no file → nothing to freeze', () => {
    expect(canonicalizeDiff('just some text', 'src/config.ts')).toBe('');
  });
});

describe('AC-7 / AC-10: multi-file paste', () => {
  it('AC-10: a `diff --git` multi-file paste freezes ONLY the chosen file section', () => {
    const res = freezePastedDiff(FULL, target('src/other.ts', 2));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.diff).toContain('+++ b/src/other.ts');
      expect(res.diff).toContain('const b = 2;');
      expect(res.diff).not.toContain('src/config.ts');
      expect(res.diff).not.toContain('sk_live_xxx');
    }
  });

  it('AC-7: headerless `---`/`+++` multi-file paste is split per file', () => {
    const pasted = [
      '--- a/src/config.ts',
      '+++ b/src/config.ts',
      HUNK,
      '--- a/src/other.ts',
      '+++ b/src/other.ts',
      OTHER_HUNK,
    ].join('\n');
    const res = freezePastedDiff(pasted, target('src/other.ts', 2));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.diff).not.toContain('sk_live_xxx');
  });

  it('AC-7: pastedDiffPaths lists the new-side paths in first-seen order, no duplicates', () => {
    expect(pastedDiffPaths(FULL)).toEqual(['src/config.ts', 'src/other.ts']);
    expect(pastedDiffPaths(`${FULL}\n${FULL}`)).toEqual(['src/config.ts', 'src/other.ts']);
    expect(pastedDiffPaths(`+++ b/a.ts\n${HUNK}`)).toEqual(['a.ts']);
  });

  it('AC-7: bare hunks carry no path of their own → []', () => {
    expect(pastedDiffPaths(HUNK)).toEqual([]);
  });
});

describe('EC-2 / EC-3: no_patch and range_outside_diff', () => {
  it('EC-2: a file that is not in the pasted diff → no_patch', () => {
    const res = freezePastedDiff(FULL, target('src/missing.ts', 1));
    expect(res).toEqual({ ok: false, reason: EVAL_ERROR.noPatch });
  });

  it('EC-2: a file section with no hunk (header only) → no_patch', () => {
    const headerOnly = 'diff --git a/src/a.ts b/src/a.ts\nBinary files a/src/a.ts and b/src/a.ts differ';
    expect(freezePastedDiff(headerOnly, target('src/a.ts', 1))).toEqual({
      ok: false,
      reason: EVAL_ERROR.noPatch,
    });
  });

  it('EC-2: unparseable text → no_patch', () => {
    expect(freezePastedDiff('not a diff at all', target('src/config.ts', 1))).toEqual({
      ok: false,
      reason: EVAL_ERROR.noPatch,
    });
  });

  it('EC-3: lines that do not intersect any hunk → range_outside_diff', () => {
    expect(freezePastedDiff(FULL, target('src/config.ts', 900, 905))).toEqual({
      ok: false,
      reason: EVAL_ERROR.rangeOutsideDiff,
    });
  });

  it('EC-3: a range that merely touches the hunk (starts inside) is accepted', () => {
    expect(freezePastedDiff(FULL, target('src/config.ts', 12, 500)).ok).toBe(true);
  });
});

describe('AC-10: new-side line numbering', () => {
  /** old side 5..8, new side 20..22 */
  const SHIFTED = ['@@ -5,4 +20,3 @@', ' keep', '-removed one', '-removed two', ' tail', '+added'].join('\n');

  it('AC-10: the range is checked against NEW-side numbers (20-22), not the old ones (5-8)', () => {
    expect(freezePastedDiff(SHIFTED, target('src/s.ts', 21)).ok).toBe(true);
    expect(freezePastedDiff(SHIFTED, target('src/s.ts', 5, 8))).toEqual({
      ok: false,
      reason: EVAL_ERROR.rangeOutsideDiff,
    });
  });
});

describe('AC-14: diffUnchanged', () => {
  const stored = (() => {
    const r = freezePastedDiff(FULL, target('src/config.ts', 11));
    if (!r.ok) throw new Error('fixture must freeze');
    return r.diff;
  })();

  it('AC-14: the stored section echoed back is unchanged (trailing newlines and CRLF ignored)', () => {
    expect(diffUnchanged(stored, `${stored}\n\n`, 'src/config.ts')).toBe(true);
    expect(diffUnchanged(stored, stored.replace(/\n/g, '\r\n'), 'src/config.ts')).toBe(true);
  });

  it('AC-14: a multi-file paste whose chosen file section equals the stored one is unchanged', () => {
    expect(diffUnchanged(stored, FULL, 'src/config.ts')).toBe(true);
  });

  it('AC-14: bare hunks identical to the stored section count as unchanged', () => {
    expect(diffUnchanged(stored, HUNK, 'src/config.ts')).toBe(true);
  });

  it('AC-14: an edited diff is a change', () => {
    expect(diffUnchanged(stored, FULL.replace('sk_live_xxx', 'sk_live_yyy'), 'src/config.ts')).toBe(false);
    expect(diffUnchanged(stored, OTHER_HUNK, 'src/config.ts')).toBe(false);
  });
});
