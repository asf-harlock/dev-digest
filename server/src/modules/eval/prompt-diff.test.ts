import { describe, it, expect } from 'vitest';
import { PROMPT_DIFF_MAX_LINES } from './constants.js';
import { diffLines } from './prompt-diff.js';

/** SPEC-08 AC-48 / AC-50 — line diff of two snapshotted system prompts. */
describe('diffLines', () => {
  it('AC-50: identical prompts → every line is context (nothing added or removed)', () => {
    const out = diffLines('a\nb\nc', 'a\nb\nc');
    expect(out).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'context', text: 'b' },
      { kind: 'context', text: 'c' },
    ]);
  });

  it('AC-48: a changed line is one removed + one added, surrounded by context', () => {
    expect(diffLines('keep\nold line\nend', 'keep\nnew line\nend')).toEqual([
      { kind: 'context', text: 'keep' },
      { kind: 'removed', text: 'old line' },
      { kind: 'added', text: 'new line' },
      { kind: 'context', text: 'end' },
    ]);
  });

  it('AC-48: pure additions and pure removals', () => {
    expect(diffLines('a', 'a\nb')).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
    expect(diffLines('a\nb', 'a')).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'removed', text: 'b' },
    ]);
  });

  it('AC-48: reconstructs both sides — context+removed is the old text, context+added the new', () => {
    const oldText = 'You are a reviewer.\nBe terse.\nCheck secrets.\nReport bugs.';
    const newText = 'You are a strict reviewer.\nBe terse.\nReport bugs.\nCheck auth.';
    const out = diffLines(oldText, newText);
    expect(out.filter((l) => l.kind !== 'added').map((l) => l.text).join('\n')).toBe(oldText);
    expect(out.filter((l) => l.kind !== 'removed').map((l) => l.text).join('\n')).toBe(newText);
  });

  it('UI-8: line text is returned verbatim (no HTML/Markdown interpretation)', () => {
    const out = diffLines('<b>x</b>', '<script>alert(1)</script>');
    expect(out).toEqual([
      { kind: 'removed', text: '<b>x</b>' },
      { kind: 'added', text: '<script>alert(1)</script>' },
    ]);
  });

  it('beyond the size cap it degrades to remove-all + add-all instead of building a huge table', () => {
    const big = Array.from({ length: PROMPT_DIFF_MAX_LINES + 1 }, (_, i) => `line ${i}`).join('\n');
    const out = diffLines(big, `${big}\nextra`);
    expect(out.every((l) => l.kind !== 'context')).toBe(true);
    expect(out.filter((l) => l.kind === 'removed')).toHaveLength(PROMPT_DIFF_MAX_LINES + 1);
    expect(out.filter((l) => l.kind === 'added')).toHaveLength(PROMPT_DIFF_MAX_LINES + 2);
  });
});
