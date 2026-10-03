import { describe, it, expect } from 'vitest';
import { computeContextFingerprint, truncateToBudget } from './pr-context-truncate.js';

const count = (t: string) => Math.ceil(t.length / 4);

describe('truncateToBudget', () => {
  const text = ['# A', 'aaaa aaaa aaaa', '', '## B', 'bbbb bbbb bbbb bbbb bbbb bbbb', '', '## C', 'cccc'.repeat(40)].join('\n');

  it('cuts before the last heading that fits and appends the marker', () => {
    const r = truncateToBudget(text, 30, count)!;
    expect(r).not.toBeNull();
    expect(r.tokens).toBeLessThanOrEqual(30);
    expect(r.text).toMatch(/\[truncated: \d+ of \d+ tokens\]$/);
    expect(r.text).not.toContain('## C');
  });

  it('falls back to whole lines when no heading fits', () => {
    const t = 'line one\nline two\nline three is much much longer than the others and will not fit';
    const r = truncateToBudget(t, 14, count)!;
    expect(r.text.startsWith('line one')).toBe(true);
    expect(r.tokens).toBeLessThanOrEqual(14);
  });

  it('returns null when nothing fits', () => {
    expect(truncateToBudget('x'.repeat(1000), 5, count)).toBeNull();
  });
});

describe('computeContextFingerprint', () => {
  it('is null for an empty list', () => {
    expect(computeContextFingerprint([])).toBeNull();
  });
  it('depends on order, blob id and unresolved status', () => {
    const a = { path: 'a.md', blobId: 'x', status: 'attached' };
    const b = { path: 'b.md', blobId: null, status: 'missing' };
    const f1 = computeContextFingerprint([a, b]);
    expect(f1).toMatch(/^[0-9a-f]{32}$/);
    expect(computeContextFingerprint([b, a])).not.toBe(f1);
    expect(computeContextFingerprint([{ ...a, blobId: 'y' }, b])).not.toBe(f1);
    expect(computeContextFingerprint([a, { ...b, status: 'unreadable' }])).not.toBe(f1);
    expect(computeContextFingerprint([a, b])).toBe(f1);
  });
});
