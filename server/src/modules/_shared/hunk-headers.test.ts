import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { buildHunkHeaderDigest, hunkHeadersByFile } from './hunk-headers.js';

describe('buildHunkHeaderDigest', () => {
  const diff = (files: UnifiedDiff['files']): UnifiedDiff => ({ raw: '', files });

  it('emits one @@ header line per hunk, grouped by file — never content', () => {
    const text = buildHunkHeaderDigest(
      diff([
        {
          path: 'src/a.ts',
          additions: 1,
          deletions: 0,
          hunks: [
            { file: 'src/a.ts', oldStart: 10, oldLines: 5, newStart: 10, newLines: 7, newLineNumbers: [] },
            { file: 'src/a.ts', oldStart: 50, oldLines: 3, newStart: 52, newLines: 3, newLineNumbers: [] },
          ],
        },
        {
          path: 'src/b.ts',
          additions: 1,
          deletions: 0,
          hunks: [{ file: 'src/b.ts', oldStart: 1, oldLines: 10, newStart: 1, newLines: 12, newLineNumbers: [] }],
        },
      ]),
    );
    expect(text).toBe(
      '### src/a.ts\n@@ -10,5 +10,7 @@\n@@ -50,3 +52,3 @@\n### src/b.ts\n@@ -1,10 +1,12 @@',
    );
  });

  it('omits files with no hunks and returns "" for an empty diff', () => {
    expect(buildHunkHeaderDigest(diff([]))).toBe('');
    expect(buildHunkHeaderDigest(diff([{ path: 'a.ts', additions: 0, deletions: 0, hunks: [] }]))).toBe('');
  });
});

describe('hunkHeadersByFile', () => {
  it('rebuilds headers from numeric fields per file and skips hunkless files', () => {
    const diff: UnifiedDiff = {
      raw: '@@ -1,2 +1,3 @@ function secretTrailer()',
      files: [
        {
          path: 'a.ts',
          additions: 1,
          deletions: 0,
          hunks: [{ file: 'a.ts', oldStart: 1, oldLines: 2, newStart: 1, newLines: 3, newLineNumbers: [] }],
        },
        { path: 'b.ts', additions: 0, deletions: 0, hunks: [] },
      ],
    };
    const m = hunkHeadersByFile(diff);
    expect([...m.keys()]).toEqual(['a.ts']);
    expect(m.get('a.ts')).toEqual(['@@ -1,2 +1,3 @@']);
  });
});
