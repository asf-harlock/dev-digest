import { describe, it, expect, vi } from 'vitest';
import type { EvalCaseUpdate } from '@devdigest/shared';
import { MockGitClient } from '../../adapters/mocks.js';
import type { Container } from '../../platform/container.js';
import type { EvalCaseRow } from '../../db/rows.js';
import { CASE_NAME_MAX, DRAFT_NAME_PREFIX } from './constants.js';
import {
  buildDraftName,
  classifyEdit,
  resolveExpectationTitle,
  toDraftOwners,
  toEvalCaseDraft,
} from './helpers.js';
import type { EvalRepository } from './repository.js';
import { EvalService } from './service.js';
import type { FindingCaseContext } from './types.js';

/**
 * SPEC-10 Phase A, hermetic: the Case Editor's draft seed (AC-2..AC-4, EC-1..EC-4, NFR-1) and the
 * expectation-title edit rule (AC-25). Pure helpers run for real; the service runs against an
 * in-memory repository and a guard container that records any outside port it touches. The route /
 * SQL side is `test/eval-draft.it.test.ts`.
 */

const WS = 'ws-1';
const AGENT = 'agent-1';
const FINDING = 'finding-1';

const PATCH = ['@@ -10,3 +10,4 @@', '   port: 3000,', '+  stripeKey: "sk_live_xxx",', '   redisUrl: x,'].join('\n');
const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  PATCH,
  'diff --git a/src/other.ts b/src/other.ts',
  '--- a/src/other.ts',
  '+++ b/src/other.ts',
  '@@ -1,2 +1,3 @@',
  ' const a = 1;',
  '+const b = 2;',
  ' export {};',
].join('\n');

const ctx = (over: { finding?: Partial<FindingCaseContext['finding']>; agentExists?: boolean } = {}): FindingCaseContext => ({
  finding: {
    id: FINDING,
    file: 'src/config.ts',
    startLine: 11,
    endLine: 11,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded Stripe key',
    kind: 'finding',
    acceptedAt: new Date('2026-05-01T00:00:00Z'),
    dismissedAt: null,
    ...over.finding,
  },
  agentId: AGENT,
  agentExists: over.agentExists ?? true,
  agentName: over.agentExists === false ? null : 'Security agent',
  pull: { id: 'pr-1', number: 482, title: 'Add rate limiting', body: 'Body text', base: 'main', headSha: 'abc' },
  repo: { owner: 'acme', name: 'payments-api', fullName: 'acme/payments-api' },
});

// ---------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------

describe('buildDraftName (AC-4, UI-6)', () => {
  it('AC-4: "From finding: {title}" for a short title', () => {
    expect(buildDraftName('Hardcoded Stripe key')).toBe('From finding: Hardcoded Stripe key');
  });

  it('AC-4/UI-6: the WHOLE name, prefix included, is cut to 80 characters', () => {
    const name = buildDraftName('x'.repeat(200));
    expect(name).toHaveLength(CASE_NAME_MAX);
    expect(name.startsWith(DRAFT_NAME_PREFIX)).toBe(true);
    // 14 prefix characters leave 66 for the title
    expect(name.slice(DRAFT_NAME_PREFIX.length)).toBe('x'.repeat(CASE_NAME_MAX - DRAFT_NAME_PREFIX.length));
  });

  it('a title that ends in a space at the cut leaves no trailing whitespace', () => {
    const title = `${'y'.repeat(CASE_NAME_MAX - DRAFT_NAME_PREFIX.length - 1)} tail`;
    const name = buildDraftName(title);
    expect(name.length).toBeLessThanOrEqual(CASE_NAME_MAX);
    expect(name).toBe(name.trimEnd());
  });
});

describe('toDraftOwners (AC-3, EC-4)', () => {
  it('AC-3: the agent first (when it exists), then the skills in the order given, each with its case state', () => {
    const owners = toDraftOwners({ id: 'a1', name: 'Agent', caseId: null }, [
      { skillId: 's2', name: 'second-in-run-order-first', caseId: 'case-s2' },
      { skillId: 's1', name: 'first', caseId: null },
    ]);
    expect(owners).toEqual([
      { kind: 'agent', id: 'a1', name: 'Agent', has_case: false, case_id: null },
      { kind: 'skill', id: 's2', name: 'second-in-run-order-first', has_case: true, case_id: 'case-s2' },
      { kind: 'skill', id: 's1', name: 'first', has_case: false, case_id: null },
    ]);
  });

  it('EC-4: with no agent only the skills are listed', () => {
    const owners = toDraftOwners(null, [{ skillId: 's1', name: 'only', caseId: null }]);
    expect(owners.map((o) => o.kind)).toEqual(['skill']);
    expect(toDraftOwners(null, [])).toEqual([]);
  });
});

describe('toEvalCaseDraft (AC-2)', () => {
  it('AC-2: copies the finding into the expectation, takes type from the decision, the diff and the PR facts', () => {
    const draft = toEvalCaseDraft(ctx(), 'must_find', 'FROZEN DIFF', []);
    expect(draft).toEqual({
      name: 'From finding: Hardcoded Stripe key',
      expectation: {
        type: 'must_find',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe key',
      },
      input_diff: 'FROZEN DIFF',
      input_meta: { pr_number: 482, repo_full_name: 'acme/payments-api', title: 'Add rate limiting', body: 'Body text' },
      owners: [],
    });
    expect(toEvalCaseDraft(ctx(), 'must_not_flag', 'D', []).expectation.type).toBe('must_not_flag');
  });
});

// ---------------------------------------------------------------------------
// AC-25 - the expectation title on PATCH
// ---------------------------------------------------------------------------

describe('resolveExpectationTitle (AC-25)', () => {
  it('a title the body carries wins; null clears; an omitted title keeps the stored one', () => {
    expect(resolveExpectationTitle('New title', 'Old title')).toBe('New title');
    expect(resolveExpectationTitle(null, 'Old title')).toBeNull();
    expect(resolveExpectationTitle(undefined, 'Old title')).toBe('Old title');
    expect(resolveExpectationTitle(undefined, undefined)).toBeNull();
    expect(resolveExpectationTitle(undefined, null)).toBeNull();
  });
});

describe('classifyEdit with a title (AC-25)', () => {
  const exp = { type: 'must_find' as const, file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security' };
  const stored = { ...exp, title: 'Stored title' };
  const base = {
    inputDiff: DIFF,
    inputMeta: { pr_number: null, repo_full_name: null, title: 'PR', body: null },
    expectedOutput: stored,
  };
  const manual = { ...base, sourceFindingId: null };
  const fromFinding = { ...base, sourceFindingId: FINDING };
  const withTitle = (title: string | null | undefined): EvalCaseUpdate => ({
    expectation: { ...exp, ...(title !== undefined ? { title } : {}) } as EvalCaseUpdate['expectation'],
  });

  it('AC-25: on a manual case a changed, cleared or omitted title is an in-place edit, never a replacement', () => {
    expect(classifyEdit(manual, withTitle('Edited'))).toBe('in_place');
    expect(classifyEdit(manual, withTitle(null))).toBe('in_place');
    expect(classifyEdit(manual, withTitle(undefined))).toBe('in_place');
  });

  it('AC-25: on a finding-made case a changed or cleared title is locked; an echoed or omitted one is in place', () => {
    expect(classifyEdit(fromFinding, withTitle('Edited'))).toBe('locked');
    expect(classifyEdit(fromFinding, withTitle(null))).toBe('locked');
    expect(classifyEdit(fromFinding, withTitle('Stored title'))).toBe('in_place');
    expect(classifyEdit(fromFinding, withTitle(undefined))).toBe('in_place');
  });
});

// ---------------------------------------------------------------------------
// EvalService with an in-memory repository
// ---------------------------------------------------------------------------

interface WorldOpts {
  finding?: Partial<FindingCaseContext['finding']>;
  agentExists?: boolean;
  skills?: { skillId: string; name: string; order: number; caseId: string | null }[];
  agentCaseId?: string | null;
  /** The finding is in no workspace the caller can see. */
  noFinding?: boolean;
  git?: MockGitClient;
  storedCase?: EvalCaseRow;
}

function makeWorld(o: WorldOpts = {}) {
  const touched: string[] = [];
  const updates: { id: string; values: { name?: string; notes?: string | null; expectation?: unknown } }[] = [];
  const replacements: { oldId: string; expectation: unknown }[] = [];
  let stored = o.storedCase;

  const repo = {
    findingContext: vi.fn(async (_ws: string, id: string) =>
      o.noFinding || id !== FINDING ? undefined : ctx({ finding: o.finding, agentExists: o.agentExists }),
    ),
    getCaseBySourceFinding: vi.fn(async (_ws: string, _f: string, owner: { kind: string; id: string }) =>
      owner.kind === 'agent' && o.agentCaseId ? ({ id: o.agentCaseId } as EvalCaseRow) : undefined,
    ),
    findingSkills: vi.fn(async (_ws: string, id: string) => (id === FINDING ? { skills: o.skills ?? [] } : undefined)),
    prFiles: vi.fn(async () => []),
    getCase: vi.fn(async () => stored),
    updateCaseInPlace: vi.fn(async (_ws: string, id: string, values: { expectation?: unknown }) => {
      updates.push({ id, values });
      stored = {
        ...(stored as EvalCaseRow),
        ...(values.expectation ? { expectedOutput: values.expectation as EvalCaseRow['expectedOutput'] } : {}),
      };
      return stored;
    }),
    replaceCase: vi.fn(async (_ws: string, oldId: string, v: { expectation: unknown }) => {
      replacements.push({ oldId, expectation: v.expectation });
      return { ...(stored as EvalCaseRow), id: 'case-new', expectedOutput: v.expectation } as EvalCaseRow;
    }),
  };

  const guard = new Proxy(
    {
      evalRepo: repo,
      agentsRepo: {},
      git: o.git ?? new MockGitClient({ diff: DIFF }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (typeof prop === 'string' && !(prop in target)) touched.push(prop);
        return target[prop as string];
      },
    },
  );
  return {
    service: new EvalService(guard as unknown as Container),
    repo: repo as unknown as EvalRepository & typeof repo,
    touched,
    updates,
    replacements,
  };
}

describe('EvalService.draftFromFinding (AC-1..AC-4, EC-1..EC-4, NFR-1)', () => {
  it('AC-2/AC-3/NFR-1: seeds a must_find draft from the finding with the agent first, then the skills, and touches no LLM port', async () => {
    const w = makeWorld({
      agentCaseId: 'case-agent',
      skills: [
        { skillId: 's1', name: 'first-skill', order: 0, caseId: null },
        { skillId: 's2', name: 'second-skill', order: 1, caseId: 'case-s2' },
      ],
    });
    const draft = await w.service.draftFromFinding(WS, FINDING);

    expect(draft.name).toBe('From finding: Hardcoded Stripe key');
    expect(draft.expectation).toMatchObject({ type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, title: 'Hardcoded Stripe key' });
    // only the finding's own file is frozen, never the other file of the PR
    expect(draft.input_diff).toContain('+++ b/src/config.ts');
    expect(draft.input_diff).not.toContain('src/other.ts');
    expect(draft.input_meta).toMatchObject({ pr_number: 482, repo_full_name: 'acme/payments-api', title: 'Add rate limiting' });
    expect(draft.owners).toEqual([
      { kind: 'agent', id: AGENT, name: 'Security agent', has_case: true, case_id: 'case-agent' },
      { kind: 'skill', id: 's1', name: 'first-skill', has_case: false, case_id: null },
      { kind: 'skill', id: 's2', name: 'second-skill', has_case: true, case_id: 'case-s2' },
    ]);
    expect(w.touched).toEqual([]); // no llm, no github, no embedder
  });

  it('AC-2: a dismissed finding seeds must_not_flag', async () => {
    const w = makeWorld({ finding: { acceptedAt: null, dismissedAt: new Date() } });
    expect((await w.service.draftFromFinding(WS, FINDING)).expectation.type).toBe('must_not_flag');
  });

  it('EC-1: an undecided finding is 422 finding_undecided, before any diff work', async () => {
    const git = new MockGitClient({ diff: DIFF });
    const diffSpy = vi.spyOn(git, 'diff');
    const w = makeWorld({ finding: { acceptedAt: null, dismissedAt: null }, git });
    await expect(w.service.draftFromFinding(WS, FINDING)).rejects.toMatchObject({ statusCode: 422, code: 'finding_undecided' });
    expect(diffSpy).not.toHaveBeenCalled();
  });

  it('EC-29: a finding outside the workspace is a 404', async () => {
    const w = makeWorld({ noFinding: true });
    await expect(w.service.draftFromFinding(WS, FINDING)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('EC-3: no agent and no recorded skill is 422 agent_missing', async () => {
    const w = makeWorld({ agentExists: false, skills: [] });
    await expect(w.service.draftFromFinding(WS, FINDING)).rejects.toMatchObject({ statusCode: 422, code: 'agent_missing' });
  });

  it('EC-4: no agent but recorded skills is a draft listing only those skills', async () => {
    const w = makeWorld({ agentExists: false, skills: [{ skillId: 's1', name: 'only-skill', order: 0, caseId: null }] });
    const draft = await w.service.draftFromFinding(WS, FINDING);
    expect(draft.owners).toEqual([{ kind: 'skill', id: 's1', name: 'only-skill', has_case: false, case_id: null }]);
  });

  it('EC-2: a file missing from the diff is no_patch; lines outside every hunk are range_outside_diff', async () => {
    let w = makeWorld({ finding: { file: 'src/gone.ts' } });
    await expect(w.service.draftFromFinding(WS, FINDING)).rejects.toMatchObject({ statusCode: 422, code: 'no_patch' });
    w = makeWorld({ finding: { startLine: 400, endLine: 410 } });
    await expect(w.service.draftFromFinding(WS, FINDING)).rejects.toMatchObject({ statusCode: 422, code: 'range_outside_diff' });
  });

  it('the draft of a full-file kind (secret_leak) is grounded on the file alone', async () => {
    const w = makeWorld({ finding: { kind: 'secret_leak', startLine: 400, endLine: 410 } });
    await expect(w.service.draftFromFinding(WS, FINDING)).resolves.toMatchObject({ expectation: { start_line: 400 } });
  });
});

describe('EvalService.updateCase - the expectation title (AC-25)', () => {
  const storedExp = { type: 'must_find' as const, file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security', title: 'Stored title' };
  const row = (sourceFindingId: string | null): EvalCaseRow =>
    ({
      id: 'case-1',
      workspaceId: WS,
      ownerKind: 'agent',
      ownerId: AGENT,
      name: 'the-case',
      inputDiff: DIFF,
      inputFiles: ['src/config.ts'],
      inputMeta: { pr_number: null, repo_full_name: null, title: 'PR', body: null },
      expectedOutput: storedExp,
      notes: null,
      sourceFindingId,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    }) as EvalCaseRow;
  const patch = (title: string | null | undefined): EvalCaseUpdate => ({
    expectation: {
      type: 'must_find',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      severity: 'CRITICAL',
      category: 'security',
      ...(title !== undefined ? { title } : {}),
    },
  });

  it('manual case: a changed title is persisted in place, same id, no replacement', async () => {
    const w = makeWorld({ storedCase: row(null) });
    const out = await w.service.updateCase(WS, 'case-1', patch('Edited title'));
    expect(out.id).toBe('case-1');
    expect(w.replacements).toEqual([]);
    expect(w.updates[0]!.values.expectation).toMatchObject({ title: 'Edited title', start_line: 11 });
  });

  it('manual case: title null clears it; an omitted title keeps the stored one', async () => {
    let w = makeWorld({ storedCase: row(null) });
    await w.service.updateCase(WS, 'case-1', patch(null));
    expect(w.updates[0]!.values.expectation).toMatchObject({ title: null });

    w = makeWorld({ storedCase: row(null) });
    await w.service.updateCase(WS, 'case-1', patch(undefined));
    expect(w.updates[0]!.values.expectation).toMatchObject({ title: 'Stored title' });
  });

  it('finding-made case: a changed title is locked (422 case_input_locked) and writes nothing', async () => {
    const w = makeWorld({ storedCase: row(FINDING) });
    await expect(w.service.updateCase(WS, 'case-1', patch('Edited title'))).rejects.toMatchObject({
      statusCode: 422,
      code: 'case_input_locked',
    });
    expect(w.updates).toEqual([]);
    expect(w.replacements).toEqual([]);
  });

  it('finding-made case: the unchanged expectation echoed back is in place and its stored expectation is untouched', async () => {
    const w = makeWorld({ storedCase: row(FINDING) });
    await w.service.updateCase(WS, 'case-1', { ...patch('Stored title'), name: 'renamed' });
    expect(w.replacements).toEqual([]);
    expect(w.updates[0]!.values).toMatchObject({ name: 'renamed' });
    expect(w.updates[0]!.values.expectation).toBeUndefined();
  });
});
