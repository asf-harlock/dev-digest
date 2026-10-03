import { describe, it, expect } from 'vitest';
import { formatRunDuration } from '../src/modules/reviews/run-duration.js';

describe('formatRunDuration', () => {
  it('formats a zero-length run', () => {
    const t = new Date('2026-09-24T12:00:00.000Z');
    expect(formatRunDuration(t, t)).toBe('0ms');
  });

  it('supports verbose output', () => {
    const t = new Date('2026-09-24T12:00:00.000Z');
    expect(formatRunDuration(t, t, { verbose: true })).toBe('0 milliseconds');
  });
});
