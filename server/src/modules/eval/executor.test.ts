import { describe, it, expect } from 'vitest';
import type { EvalRunSnapshot, Review, StructuredRequest } from '@devdigest/shared';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { EVAL_TASK_LINE } from './constants.js';
import { reviewFrozenCase, type FrozenCaseInput } from './executor.js';

/**
 * SPEC-08 executor — reviews ONE frozen case through the real reviewer-core
 * engine with a mock LLM (the outside world). Placeholder secrets only (NFR-14).
 */

const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');

const CASE: FrozenCaseInput = {
  inputDiff: DIFF,
  inputMeta: { title: 'Add rate limiting', body: 'Adds rate limiting. Closes #471.' },
};

const SNAPSHOT: EvalRunSnapshot = {
  provider: 'openai',
  model: 'gpt-4.1',
  strategy: 'auto',
  system_prompt: 'You are a strict reviewer.',
  skills: [{ name: 'secrets', body: 'Never commit credentials.' }],
};

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded key.',
  score: 40,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A key is committed.',
      confidence: 0.9,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'Not in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

const llm = (structured: unknown = REVIEW) => new MockLLMProvider('openai', { structured });

const userMessageOf = (provider: MockLLMProvider): string => {
  const req = provider.calls[0]!.req as StructuredRequest<unknown>;
  return req.messages.find((m) => m.role === 'user')!.content as string;
};

describe('reviewFrozenCase', () => {
  it('AC-22/NFR-2: one structured review call per case — nothing else is called', async () => {
    const mock = llm();
    await reviewFrozenCase(SNAPSHOT, CASE, mock);
    expect(mock.calls.map((c) => c.method)).toEqual(['completeStructured']);
    // the snapshotted model, not a live agent lookup
    const req = mock.calls[0]!.req as StructuredRequest<unknown>;
    expect(req.model).toBe('gpt-4.1');
    // at most 2 structured-output re-prompts
    expect(req.maxRetries ?? 0).toBeLessThanOrEqual(2);
  });

  it('AC-22/UI-2: two runs of the same case send byte-identical prompts', async () => {
    const a = llm();
    const b = llm();
    const ra = await reviewFrozenCase(SNAPSHOT, CASE, a);
    const rb = await reviewFrozenCase(SNAPSHOT, CASE, b);
    const reqA = a.calls[0]!.req as StructuredRequest<unknown>;
    const reqB = b.calls[0]!.req as StructuredRequest<unknown>;
    expect(JSON.stringify(reqA.messages)).toBe(JSON.stringify(reqB.messages));
    expect(ra.assembly).toEqual(rb.assembly);
  });

  it('AC-22: no repo-intel, project-context, PR-context, intent or memory section reaches the prompt', async () => {
    const mock = llm();
    const result = await reviewFrozenCase(SNAPSHOT, CASE, mock);
    const user = userMessageOf(mock);
    for (const heading of [
      '## Repo skeleton',
      '## PR context',
      '## Project context',
      '## Callers of changed symbols',
      '## Declared intent & scope',
      '## Relevant memory',
    ]) {
      expect(user).not.toContain(heading);
    }
    expect(user).not.toContain('project-context:');
    expect(user).not.toContain('pr-context:');
    const system = (mock.calls[0]!.req as StructuredRequest<unknown>).messages[0]!.content as string;
    expect(system).not.toContain('pr-context:');
    expect(result.assembly).toMatchObject({
      callers: null,
      repo_map: null,
      intent: null,
      memory: null,
      specs: null,
    });
  });

  it('UI-1/UI-2: frozen diff is wrapped as untrusted, the guard stays, title only in the task line, body only as the PR description', async () => {
    const mock = llm();
    await reviewFrozenCase(SNAPSHOT, CASE, mock);
    const req = mock.calls[0]!.req as StructuredRequest<unknown>;
    const system = req.messages[0]!.content as string;
    const user = userMessageOf(mock);

    expect(system.startsWith('You are a strict reviewer.')).toBe(true);
    expect(system).toContain('<untrusted>');
    expect(user).toContain('<untrusted source="diff">');
    expect(user).toContain('sk_live_xxx');

    // task line: frozen title + the author-free guidance
    expect(user).toContain(`Review pull request "Add rate limiting". ${EVAL_TASK_LINE}`);
    // the title appears exactly once (the task line); the body is the wrapped PR description
    expect(user.split('"Add rate limiting"').length - 1).toBe(1);
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting. Closes #471.');
    // no author is part of a case's frozen input
    expect(user.toLowerCase()).not.toContain('author');
  });

  it('AC-20/AC-22: snapshotted skills are rendered into the prompt in order; none → no skills section', async () => {
    const withSkills = llm();
    await reviewFrozenCase(
      {
        ...SNAPSHOT,
        skills: [
          { name: 'first', body: 'Body one.' },
          { name: 'second', body: 'Body two.' },
        ],
      },
      CASE,
      withSkills,
    );
    const user = userMessageOf(withSkills);
    expect(user).toContain('## Skills / rules\n### first\nBody one.\n\n### second\nBody two.');

    const without = llm();
    await reviewFrozenCase({ ...SNAPSHOT, skills: [] }, CASE, without);
    expect(userMessageOf(without)).not.toContain('## Skills / rules');
  });

  it('EC: an empty frozen PR body omits the PR description section', async () => {
    const mock = llm();
    await reviewFrozenCase(
      SNAPSHOT,
      { ...CASE, inputMeta: { title: 'Add rate limiting', body: null } },
      mock,
    );
    expect(userMessageOf(mock)).not.toContain('## PR description');
  });

  it('UI-4/AC-23/AC-32: only grounded findings are kept; grounding counts include the dropped ones', async () => {
    const result = await reviewFrozenCase(SNAPSHOT, CASE, llm());
    expect(result.findings).toEqual([
      {
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        title: 'Hardcoded Stripe key',
        severity: 'CRITICAL',
        category: 'security',
      },
    ]);
    expect(result.groundingKept).toBe(1);
    expect(result.groundingTotal).toBe(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.costUsd).toBe(0.001);
  });

  it('zero findings is a valid result (no padding)', async () => {
    const result = await reviewFrozenCase(
      SNAPSHOT,
      CASE,
      llm({ verdict: 'approve', summary: 'ok', score: 95, findings: [] }),
    );
    expect(result).toMatchObject({ findings: [], groundingKept: 0, groundingTotal: 0 });
  });

  it('EC-12: a frozen diff that parses to zero files throws before any LLM call', async () => {
    const mock = llm();
    await expect(
      reviewFrozenCase(SNAPSHOT, { ...CASE, inputDiff: 'not a diff at all' }, mock),
    ).rejects.toThrow('frozen diff has no files');
    expect(mock.calls).toHaveLength(0);
  });

  it('EC-12: a provider failure propagates so the caller can record an errored case', async () => {
    const failing = new MockLLMProvider('openai', { structured: { not: 'a review' } });
    await expect(reviewFrozenCase(SNAPSHOT, CASE, failing)).rejects.toThrow();
  });
});
