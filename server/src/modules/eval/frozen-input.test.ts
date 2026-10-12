import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { extractFileDiff, freezeFileDiff, rawDiffFromPrFiles } from './frozen-input.js';

/**
 * SPEC-08 frozen case input — pure. Secrets in fixtures are placeholders only
 * (`sk_live_xxx`, NFR-14 / UI-9).
 */

const CONFIG_PATCH = [
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');

const OTHER_PATCH = ['@@ -1,2 +1,3 @@', ' const a = 1;', '+const b = 2;', ' export {};'].join('\n');

/** A second hunk far away from the first, to test "intersects A hunk, not the whole file". */
const TWO_HUNK_PATCH = [
  '@@ -1,2 +1,3 @@',
  ' head',
  '+added near the top',
  ' tail',
  '@@ -200,2 +201,3 @@',
  ' far',
  '+added far below',
  ' end',
].join('\n');

const files = [
  { path: 'src/config.ts', patch: CONFIG_PATCH },
  { path: 'src/config.tsx', patch: OTHER_PATCH },
  { path: 'lib/src/config.ts', patch: OTHER_PATCH },
  { path: 'assets/logo.png', patch: null }, // binary / too large: no patch
  { path: 'src/two.ts', patch: TWO_HUNK_PATCH },
];
const RAW = rawDiffFromPrFiles(files);

describe('rawDiffFromPrFiles', () => {
  it('AC-4: wraps each hunks-only patch in git headers and skips files with no patch', () => {
    expect(RAW).toContain('diff --git a/src/config.ts b/src/config.ts');
    expect(RAW).toContain('+++ b/src/config.ts');
    expect(RAW).not.toContain('logo.png');
    // the result parses like real `git diff` output
    expect(parseUnifiedDiff(RAW).files.map((f) => f.path)).toEqual([
      'src/config.ts',
      'src/config.tsx',
      'lib/src/config.ts',
      'src/two.ts',
    ]);
  });
});

describe('extractFileDiff — exact path splitter', () => {
  it('AC-4: returns only the requested file, headers plus every hunk', () => {
    const section = extractFileDiff(RAW, 'src/two.ts')!;
    expect(section.startsWith('diff --git a/src/two.ts b/src/two.ts')).toBe(true);
    expect(section).toContain('+++ b/src/two.ts');
    expect(section).toContain('@@ -1,2 +1,3 @@');
    expect(section).toContain('@@ -200,2 +201,3 @@');
    expect(section).not.toContain('src/config');
    expect(parseUnifiedDiff(section).files).toHaveLength(1);
  });

  it('AC-4: an exact match — a longer or prefixed path never leaks into the case', () => {
    const section = extractFileDiff(RAW, 'src/config.ts')!;
    expect(section).toContain('sk_live_xxx');
    expect(section).not.toContain('src/config.tsx');
    expect(section).not.toContain('lib/src/config.ts');
    expect(parseUnifiedDiff(section).files.map((f) => f.path)).toEqual(['src/config.ts']);
    // the fuzzy `includes` behaviour of sliceDiff is NOT used: a substring is not a match
    expect(extractFileDiff(RAW, 'config.ts')).toBeNull();
    expect(extractFileDiff(RAW, 'src/config')).toBeNull();
  });

  it('EC-4: a file that is not in the diff, or has no hunk, yields null — never the whole diff', () => {
    expect(extractFileDiff(RAW, 'src/missing.ts')).toBeNull();
    const binaryOnly = 'diff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ';
    expect(extractFileDiff(binaryOnly, 'img.png')).toBeNull();
  });

  it('resolves a deleted file (+++ /dev/null) through the diff --git header', () => {
    const raw = [
      'diff --git a/src/gone.ts b/src/gone.ts',
      '--- a/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-a',
      '-b',
    ].join('\n');
    expect(extractFileDiff(raw, 'src/gone.ts')).toContain('@@ -1,2 +0,0 @@');
  });
});

describe('freezeFileDiff', () => {
  const target = (start: number, end: number, kind?: string | null) => ({
    file: 'src/config.ts',
    start_line: start,
    end_line: end,
    ...(kind !== undefined ? { kind } : {}),
  });

  it('AC-2/AC-4: a range inside a hunk freezes the file diff', () => {
    const r = freezeFileDiff(RAW, target(11, 11));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diff).toBe(extractFileDiff(RAW, 'src/config.ts'));
      expect(r.diff).not.toContain('src/two.ts');
    }
  });

  it('EC-5: the range must intersect a hunk — one touching only its edge counts, one outside does not', () => {
    // the hunk body covers new-side lines 10..12
    expect(freezeFileDiff(RAW, target(12, 20)).ok).toBe(true);
    expect(freezeFileDiff(RAW, target(1, 9))).toEqual({ ok: false, reason: 'range_outside_diff' });
    expect(freezeFileDiff(RAW, target(13, 30))).toEqual({ ok: false, reason: 'range_outside_diff' });
  });

  it('EC-5: with two hunks the range need only intersect one of them, not sit between them', () => {
    const two = (start: number, end: number) =>
      freezeFileDiff(RAW, { file: 'src/two.ts', start_line: start, end_line: end });
    expect(two(2, 2).ok).toBe(true); // first hunk
    expect(two(202, 202).ok).toBe(true); // second hunk
    expect(two(50, 60)).toEqual({ ok: false, reason: 'range_outside_diff' }); // the gap
  });

  it('EC-4: a file absent from the diff, or with no patch, is no_patch (not range_outside_diff)', () => {
    expect(freezeFileDiff(RAW, { file: 'src/missing.ts', start_line: 1, end_line: 1 })).toEqual({
      ok: false,
      reason: 'no_patch',
    });
    expect(freezeFileDiff(RAW, { file: 'assets/logo.png', start_line: 1, end_line: 1 })).toEqual({
      ok: false,
      reason: 'no_patch',
    });
  });

  it.each(['secret_leak', 'lethal_trifecta', 'phantom', 'hook'])(
    'EC-6: full-file kind %s only needs the file present, whatever the lines',
    (kind) => {
      expect(freezeFileDiff(RAW, target(900, 999, kind)).ok).toBe(true);
    },
  );

  it('EC-6: full-file kinds still need the file — a missing file is no_patch', () => {
    expect(
      freezeFileDiff(RAW, { file: 'src/missing.ts', start_line: 1, end_line: 1, kind: 'secret_leak' }),
    ).toEqual({ ok: false, reason: 'no_patch' });
  });

  it('EC-6: a plain finding / unknown kind is NOT exempt from the range check', () => {
    expect(freezeFileDiff(RAW, target(900, 999, 'finding')).ok).toBe(false);
    expect(freezeFileDiff(RAW, target(900, 999, null)).ok).toBe(false);
    expect(freezeFileDiff(RAW, target(900, 999, 'not-a-kind')).ok).toBe(false);
  });
});

describe('NFR-14: fixtures carry placeholder secrets only', () => {
  it('uses sk_live_xxx-style placeholders — no realistic key body', () => {
    // a realistic Stripe live key has a long alphanumeric body after `sk_live_`
    expect(RAW).not.toMatch(/sk_live_[A-Za-z0-9]{16,}/);
    expect(RAW).not.toMatch(/gh[ps]_[A-Za-z0-9]{36,}/);
  });
});
