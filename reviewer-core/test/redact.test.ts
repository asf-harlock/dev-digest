import { describe, it, expect } from 'vitest';
import type { Finding, Review } from '@devdigest/shared';
import { redactSecrets, redactReview } from '../src/review/redact.js';

/**
 * redactSecrets/redactReview — the last line of defense against a finding
 * that cites a real diff line (so it survives grounding) but whose free text
 * was talked into carrying a real secret, whether by an adversarial/imported
 * skill body or a confabulating model.
 */

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'security',
    title: 'plain title',
    file: 'a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'plain rationale',
    confidence: 0.9,
    kind: 'finding',
    ...overrides,
  };
}

function review(overrides: Partial<Review> = {}): Review {
  return { verdict: 'comment', summary: 'plain summary', score: 88, findings: [finding()], ...overrides };
}

describe('redactSecrets', () => {
  it('leaves ordinary review prose untouched (no false positives)', () => {
    const text =
      'This handler awaits db.insert without a try/catch, and the token bucket key is derived from req.ip.';
    expect(redactSecrets(text)).toEqual({ text, kinds: [] });
  });

  it.each([
    ['aws_access_key_id', 'key is AKIAABCDEFGHIJKLMNOP here'],
    ['openrouter_key', `key is sk-or-v1-${'a'.repeat(64)} here`],
    ['anthropic_key', `key is sk-ant-${'a'.repeat(24)} here`],
    ['openai_key', `key is sk-${'a'.repeat(24)} here`],
    ['github_token', `token is ghp_${'a'.repeat(36)} here`],
    ['stripe_key', 'key is sk_live_abcdefghij here'],
    ['slack_token', 'token is xoxb-abcdefghij here'],
    ['jwt', 'jwt is eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGVzdHNpZ25hdHVyZQ here'],
    ['bearer_token', `header is Bearer ${'a'.repeat(24)} here`],
  ])('redacts a %s', (kind, text) => {
    const result = redactSecrets(text);
    expect(result.kinds).toEqual([kind]);
    expect(result.text).toContain(`[REDACTED:${kind}]`);
    expect(result.text).not.toMatch(/AKIA|sk-or-v1-|sk-ant-|ghp_|sk_live_|xoxb-|eyJ|Bearer [A-Za-z0-9]/);
  });

  it('redacts a PEM private key block', () => {
    const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIB...\n-----END RSA PRIVATE KEY-----';
    const result = redactSecrets(text);
    expect(result.kinds).toEqual(['private_key_block']);
    expect(result.text).toBe('[REDACTED:private_key_block]');
  });

  it('does not double-match a specific prefix under the generic openai_key pattern', () => {
    // sk-or-v1-... and sk-ant-... both start with "sk-": the specific patterns
    // must win, or the generic pattern would relabel them as openai_key.
    const openrouter = redactSecrets(`sk-or-v1-${'a'.repeat(64)}`);
    expect(openrouter.kinds).toEqual(['openrouter_key']);
    const anthropic = redactSecrets(`sk-ant-${'a'.repeat(24)}`);
    expect(anthropic.kinds).toEqual(['anthropic_key']);
  });
});

describe('redactReview', () => {
  it('is a no-op (same reference) when nothing matches', () => {
    const r = review();
    const result = redactReview(r);
    expect(result.kinds).toEqual([]);
    expect(result.review).toBe(r);
  });

  it('redacts a secret hidden in a finding rationale and reports its kind', () => {
    const r = review({
      findings: [finding({ rationale: `leaked key: sk_live_${'a'.repeat(20)}` })],
    });
    const result = redactReview(r);
    expect(result.kinds).toEqual(['stripe_key']);
    expect(result.review.findings[0]!.rationale).toBe('leaked key: [REDACTED:stripe_key]');
    // everything else on the finding is untouched
    expect(result.review.findings[0]!.title).toBe('plain title');
  });

  it('redacts a secret in the review summary independently of findings', () => {
    const r = review({ summary: `see key sk_live_${'a'.repeat(20)}` });
    const result = redactReview(r);
    expect(result.kinds).toEqual(['stripe_key']);
    expect(result.review.summary).toBe('see key [REDACTED:stripe_key]');
  });

  it('redacts a secret hidden in a suggestion field', () => {
    const r = review({
      findings: [finding({ suggestion: `rotate sk_live_${'a'.repeat(20)}` })],
    });
    const result = redactReview(r);
    expect(result.kinds).toEqual(['stripe_key']);
    expect(result.review.findings[0]!.suggestion).toBe('rotate [REDACTED:stripe_key]');
  });

  it('collects kinds across multiple findings and the summary', () => {
    const r = review({
      summary: `AKIAABCDEFGHIJKLMNOP`,
      findings: [
        finding({ id: 'f1', rationale: 'sk_live_' + 'a'.repeat(20) }),
        finding({ id: 'f2', rationale: 'plain', title: 'ghp_' + 'a'.repeat(36) }),
      ],
    });
    const result = redactReview(r);
    expect(result.kinds.sort()).toEqual(['aws_access_key_id', 'github_token', 'stripe_key'].sort());
  });
});
