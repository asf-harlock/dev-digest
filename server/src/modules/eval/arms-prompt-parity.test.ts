import { describe, it, expect } from 'vitest';
import type { PromptAssembly, Review, StructuredRequest } from '@devdigest/shared';
import { MockLLMProvider } from '../../adapters/mocks.js';
import { renderSkillBlock } from '../_shared/skill-render.js';
import { buildArms, type CarrierLink } from './arms.js';
import { armSnapshot, buildSkillRunSnapshot } from './helpers.js';
import { reviewFrozenCase, type FrozenCaseInput } from './executor.js';

/**
 * SPEC-09 D7 / AC-27 — prompt parity of the two arms. Both arms go through the
 * same `reviewFrozenCase` with the same case, and the only thing that may differ
 * between the two assembled prompts is the skill block. The seam is the real
 * chain `buildArms` → `buildSkillRunSnapshot` → `armSnapshot` → `reviewFrozenCase`
 * (the exact pieces `EvalService.executeSkillRun` composes); the LLM is a mock.
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

const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded key.',
  score: 40,
  findings: [
    {
      id: 'f1',
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
  ],
};

const SUT = { id: 'id-sut', name: 'sut-skill', body: 'SUT-BODY: never ship secrets.', version: 3 };
const CARRIER = {
  id: 'agent-1',
  name: 'Carrier',
  version: 2,
  provider: 'openai' as const,
  model: 'gpt-4.1',
  strategy: 'single-pass' as const,
  systemPrompt: 'You are a strict reviewer.',
};

const link = (name: string, order: number): CarrierLink => ({
  skillId: `id-${name}`,
  name,
  body: `body of ${name}`,
  order,
  linkEnabled: true,
  skillEnabled: true,
});

/** Run both arms of one case exactly as the service does. */
async function reviewBothArms(links: CarrierLink[], linkOrder: number | null) {
  const { withArm, withoutArm } = buildArms(links, SUT, linkOrder);
  const snapshot = buildSkillRunSnapshot({
    carrier: CARRIER,
    skill: SUT,
    withSkills: withArm,
    withoutSkills: withoutArm,
  });
  const withLlm = new MockLLMProvider('openai', { structured: REVIEW });
  const withoutLlm = new MockLLMProvider('openai', { structured: REVIEW });
  const withResult = await reviewFrozenCase(armSnapshot(snapshot, 'with'), CASE, withLlm);
  const withoutResult = await reviewFrozenCase(armSnapshot(snapshot, 'without'), CASE, withoutLlm);
  const messages = (llm: MockLLMProvider) => (llm.calls[0]!.req as StructuredRequest<unknown>).messages;
  return {
    withArm,
    withoutArm,
    withAssembly: withResult.assembly,
    withoutAssembly: withoutResult.assembly,
    withMessages: messages(withLlm),
    withoutMessages: messages(withoutLlm),
    withLlm,
    withoutLlm,
  };
}

/** Every field of an assembly except the skill block and the user message that embeds it. */
const exceptSkills = (a: PromptAssembly) => {
  const { skills: _skills, user: _user, ...rest } = a;
  return rest;
};

describe('skill-run prompt parity (AC-27, D7)', () => {
  it('AC-27: with no other linked skill, the with prompt is the without prompt plus exactly the skill block', async () => {
    const r = await reviewBothArms([], null);

    // the only differing assembly slots are the skill block and the user message that holds it
    expect(exceptSkills(r.withAssembly)).toEqual(exceptSkills(r.withoutAssembly));
    expect(r.withoutAssembly.skills).toBeNull();
    expect(r.withAssembly.skills).toBe(renderSkillBlock(SUT));

    // removing the skill section from the with-user message yields the without-user message byte for byte
    const skillSection = `## Skills / rules\n${r.withAssembly.skills}\n\n`;
    expect(r.withAssembly.user).toContain(skillSection);
    expect(r.withAssembly.user.replace(skillSection, '')).toBe(r.withoutAssembly.user);

    // the system message is identical, and so is everything the model is sent but the user's skill section
    expect(r.withMessages[0]).toEqual(r.withoutMessages[0]);
    expect(r.withoutAssembly.user).not.toContain('## Skills / rules');
  });

  it('AC-27: with other linked skills, both prompts carry them identically and differ only by the skill under test\'s block', async () => {
    const r = await reviewBothArms([link('a', 0), link('b', 1), link('c', 2)], 1);

    expect(exceptSkills(r.withAssembly)).toEqual(exceptSkills(r.withoutAssembly));
    const others = ['a', 'b', 'c'].map((n) => renderSkillBlock({ name: n, body: `body of ${n}` }));
    expect(r.withoutAssembly.skills).toBe(others.join('\n\n'));
    // the skill under test sits at its link position (after the tie of order 1 → between b and c)
    expect(r.withAssembly.skills).toBe([others[0], others[1], renderSkillBlock(SUT), others[2]].join('\n\n'));

    // swapping the skill blocks makes the two user messages identical
    expect(
      r.withAssembly.user.replace(`## Skills / rules\n${r.withAssembly.skills}`, `## Skills / rules\n${r.withoutAssembly.skills}`),
    ).toBe(r.withoutAssembly.user);
    expect(r.withMessages[0]).toEqual(r.withoutMessages[0]);
  });

  it('AC-27/NFR-2: each arm is exactly one structured review call on the snapshotted carrier model', async () => {
    const r = await reviewBothArms([link('a', 0)], 0);
    for (const llm of [r.withLlm, r.withoutLlm]) {
      expect(llm.calls.map((c) => c.method)).toEqual(['completeStructured']);
      expect((llm.calls[0]!.req as StructuredRequest<unknown>).model).toBe('gpt-4.1');
    }
  });

  it('AC-27: the frozen input is rendered the same in both arms — title only in the task line, body as PR description, no live context', async () => {
    const r = await reviewBothArms([link('a', 0)], 0);
    for (const user of [r.withAssembly.user, r.withoutAssembly.user]) {
      expect(user).toContain('Review pull request "Add rate limiting".');
      expect(user).toContain('Adds rate limiting. Closes #471.');
      for (const heading of ['## Repo skeleton', '## PR context', '## Project context', '## Callers of changed symbols', '## Declared intent & scope', '## Relevant memory']) {
        expect(user).not.toContain(heading);
      }
    }
  });
});
