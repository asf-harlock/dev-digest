import { describe, expect, it } from 'vitest';
import {
  BriefEnvelope,
  BriefModelOutput,
  BriefResponse,
  formatFileRef,
  parseFileRef,
} from '@devdigest/shared';

// Identical vectors live in client/src/lib/brief-contract.test.ts: the two
// vendored copies of the contract must agree.
const PARSE_VECTORS: Array<[string, { path: string; start: number | null; end: number | null }]> = [
  ['src/a.ts', { path: 'src/a.ts', start: null, end: null }],
  ['src/a.ts:12', { path: 'src/a.ts', start: 12, end: null }],
  ['src/a.ts:12-30', { path: 'src/a.ts', start: 12, end: 30 }],
  ['src/a.ts:12-12', { path: 'src/a.ts', start: 12, end: null }],
  ['dir:x/a.ts', { path: 'dir:x/a.ts', start: null, end: null }],
  ['dir:x/a.ts:7', { path: 'dir:x/a.ts', start: 7, end: null }],
  ['src/a.ts:0', { path: 'src/a.ts:0', start: null, end: null }],
  ['src/a.ts:30-12', { path: 'src/a.ts:30-12', start: null, end: null }],
  ['src/a.ts:abc', { path: 'src/a.ts:abc', start: null, end: null }],
];

const FORMAT_VECTORS: Array<[[string, number?, number?], string]> = [
  [['src/a.ts'], 'src/a.ts'],
  [['src/a.ts', 12], 'src/a.ts:12'],
  [['src/a.ts', 12, 30], 'src/a.ts:12-30'],
  [['src/a.ts', 12, 12], 'src/a.ts:12'],
  [['src/a.ts', 12, 5], 'src/a.ts:12'],
  [['src/a.ts', 0], 'src/a.ts'],
  [['dir:x/a.ts', 7], 'dir:x/a.ts:7'],
];

describe('brief file refs', () => {
  it.each(PARSE_VECTORS)('parses %s', (ref, expected) => {
    expect(parseFileRef(ref)).toEqual(expected);
  });

  it.each(FORMAT_VECTORS)('formats %j', (args, expected) => {
    expect(formatFileRef(...args)).toBe(expected);
  });

  it('round-trips valid refs', () => {
    for (const ref of ['a.ts', 'a.ts:3', 'a.ts:3-9', 'x:y/a.ts:3']) {
      const p = parseFileRef(ref);
      expect(formatFileRef(p.path, p.start, p.end)).toBe(ref);
    }
  });
});

describe('brief envelope', () => {
  const output = {
    summary: 's',
    risks: [{ kind: 'k', title: 't', explanation: 'e', severity: 'high', file_refs: ['a.ts:1'] }],
    review_focus: [{ file: 'a.ts', line: 1, reason: 'r' }],
  };

  it('requires every model output field and an integer line', () => {
    expect(BriefModelOutput.safeParse(output).success).toBe(true);
    expect(BriefModelOutput.safeParse({ ...output, review_focus: undefined }).success).toBe(false);
    expect(
      BriefModelOutput.safeParse({ ...output, review_focus: [{ file: 'a', line: 1.5, reason: 'r' }] })
        .success,
    ).toBe(false);
  });

  it('accepts an error-only envelope', () => {
    const r = BriefEnvelope.safeParse({ last_error: 'boom', last_error_at: '2026-01-01T00:00:00Z' });
    expect(r.success).toBe(true);
  });

  it('reads an old envelope with missing fields as empty (EC-22)', () => {
    const r = BriefEnvelope.parse({ brief: output });
    expect(r.missing_inputs).toBeUndefined();
    expect(r.generated_for_sha).toBeUndefined();
    expect(r.last_error).toBeUndefined();
  });

  it('rejects an invalid document (EC-21)', () => {
    expect(BriefEnvelope.safeParse({ brief: { summary: 1 } }).success).toBe(false);
    expect(BriefEnvelope.safeParse('nope').success).toBe(false);
    expect(BriefEnvelope.safeParse({ missing_inputs: [{ kind: 'bogus' }] }).success).toBe(false);
  });

  it('validates a response', () => {
    const r = BriefResponse.safeParse({
      brief: null,
      meta: null,
      generating: false,
      stale: false,
      missing_inputs: [{ kind: 'specs_missing' }],
    });
    expect(r.success).toBe(true);
  });
});
