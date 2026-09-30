import { describe, expect, it } from 'vitest';
import { detectInjectionPatterns, findInjectionMatches, maskMarkdownCode } from './injection-detection.js';

describe('findInjectionMatches', () => {
  it('returns the pattern, 1-based line and offending line of the first hit', () => {
    const body = 'intro\nfine line\n  The model sees <untrusted> tags here  \nlast';
    expect(findInjectionMatches(body)).toEqual([
      { pattern: 'delimiter-escape', line: 3, excerpt: 'The model sees <untrusted> tags here' },
    ]);
  });

  it('caps a long offending line', () => {
    const [m] = findInjectionMatches(`<system>${'x'.repeat(500)}`);
    expect(m?.excerpt.length).toBe(241);
    expect(m?.excerpt.endsWith('…')).toBe(true);
  });

  it('is empty for clean text', () => {
    expect(findInjectionMatches('# Just docs')).toEqual([]);
  });
});

describe('ignoreCode', () => {
  const doc = [
    'Prose about `<untrusted>` tags.',
    '```xml',
    '<system>',
    '```',
    '~~~',
    '</task>',
    '~~~',
    'after',
  ].join('\n');

  it('skips inline code spans and fenced blocks', () => {
    expect(detectInjectionPatterns(doc, { ignoreCode: true }).detected).toBe(false);
    expect(detectInjectionPatterns(doc).detected).toBe(true);
  });

  it('still flags the same syntax in plain prose, with the original line number', () => {
    const text = `${doc}\nreal <system> tag`;
    expect(findInjectionMatches(text, { ignoreCode: true })).toEqual([
      { pattern: 'delimiter-escape', line: 9, excerpt: 'real <system> tag' },
    ]);
  });

  it('treats an unterminated fence as running to the end', () => {
    expect(detectInjectionPatterns('```\n<system>', { ignoreCode: true }).detected).toBe(false);
  });

  it('preserves length and newlines', () => {
    expect(maskMarkdownCode(doc)).toHaveLength(doc.length);
  });
});
