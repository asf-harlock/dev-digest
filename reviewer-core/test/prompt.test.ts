/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ## Declared intent & scope', () => {
  it('renders the section (untrusted-wrapped) near the PR description, before the diff, when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
      intent: {
        summary: 'Adds rate limiting middleware to the public API.',
        inScope: ['server/src/middleware/rate-limit.ts'],
        outOfScope: ['unrelated lint fixes in server/src/db/schema.ts'],
      },
    });
    const user = messages[1]!.content;
    expect(user).toContain('## Declared intent & scope');
    expect(user).toContain('<untrusted source="intent">');
    expect(user).toContain('Adds rate limiting middleware to the public API.');
    expect(user).toContain('server/src/middleware/rate-limit.ts');
    expect(user).toContain('unrelated lint fixes in server/src/db/schema.ts');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Declared intent & scope'));
    expect(user.indexOf('## Declared intent & scope')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.intent).toContain('Adds rate limiting middleware');
  });

  it('omits the section entirely when intent is undefined (byte-identical to the pre-feature prompt)', () => {
    const withoutIntent = assemblePrompt({ system: 'sys', diff: 'DIFF' });
    const withUndefinedIntent = assemblePrompt({ system: 'sys', diff: 'DIFF', intent: undefined });
    expect(withoutIntent.messages).toEqual(withUndefinedIntent.messages);
    expect(withoutIntent.assembly).toEqual(withUndefinedIntent.assembly);
    expect(withoutIntent.messages[1]!.content).not.toContain('## Declared intent & scope');
    expect(withoutIntent.assembly.intent ?? null).toBeNull();
  });

  it('omits the section when intent.summary is blank', () => {
    const user = userOf({
      system: 'sys',
      diff: 'DIFF',
      intent: { summary: '   ', inScope: [], outOfScope: [] },
    });
    expect(user).not.toContain('## Declared intent & scope');
  });
});
