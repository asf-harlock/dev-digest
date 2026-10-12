import { describe, it, expect, beforeEach } from 'vitest';
import type { EvalCaseInput } from '@devdigest/shared';
import { MockGitClient } from '../../adapters/mocks.js';
import type { Container } from '../../platform/container.js';
import type { EvalCaseRow } from '../../db/rows.js';
import type { EvalRepository, InsertCase } from './repository.js';
import { EvalService } from './service.js';

/**
 * SPEC-09 EvalService — hermetic. The repository is an in-memory stub and the
 * container is a guard: anything the service reads from it other than
 * `evalRepo`, `agentsRepo` and `git` (an LLM provider, GitHub, an embedder …)
 * is recorded, so a test can prove NFR-1 — case CRUD, finding → skill case and
 * every read make no model call. The route/SQL side is `eval-cases.it.test.ts`.
 */

const WS = 'ws-1';
const AGENT = 'agent-1';
const SKILL = 'skill-1';
const FINDING = 'finding-1';

const PATCH = ['@@ -10,3 +10,4 @@', '   port: 3000,', '+  stripeKey: "sk_live_xxx",', '   redisUrl: x,'].join('\n');
const DIFF = ['diff --git a/src/config.ts b/src/config.ts', '--- a/src/config.ts', '+++ b/src/config.ts', PATCH].join('\n');

const input = (over: Partial<EvalCaseInput> = {}): EvalCaseInput => ({
  name: 'manual-case',
  notes: null,
  input_diff: DIFF,
  input_meta: { title: 'Add key', body: null },
  expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 },
  ...over,
});

function makeWorld() {
  const cases = new Map<string, EvalCaseRow>();
  let seq = 0;
  const touched: string[] = [];

  const rowFrom = (v: InsertCase): EvalCaseRow => {
    const now = v.createdAt ?? new Date(2026, 0, 1, 0, 0, ++seq);
    return {
      id: `case-${++seq}`,
      workspaceId: v.workspaceId,
      ownerKind: v.owner.kind,
      ownerId: v.owner.id,
      name: v.name,
      inputDiff: v.inputDiff,
      inputFiles: v.inputFiles,
      inputMeta: v.inputMeta,
      expectedOutput: v.expectation,
      notes: v.notes ?? null,
      sourceFindingId: v.sourceFindingId,
      createdAt: now,
      updatedAt: now,
    } as EvalCaseRow;
  };

  const repo = {
    skillForEval: async (_ws: string, id: string) => (id === SKILL ? { id, name: 'a-skill' } : undefined),
    insertCase: async (v: InsertCase) => {
      const row = rowFrom(v);
      cases.set(row.id, row);
      return row;
    },
    getCase: async (_ws: string, id: string) => cases.get(id),
    listCases: async () => [...cases.values()],
    latestFinishedSkillResults: async () => undefined,
    deleteCase: async (_ws: string, id: string) => cases.delete(id),
    updateCaseInPlace: async (_ws: string, id: string, v: { name?: string; notes?: string | null }) => {
      const row = cases.get(id);
      if (!row) return undefined;
      const next = { ...row, ...(v.name !== undefined ? { name: v.name } : {}), ...(v.notes !== undefined ? { notes: v.notes } : {}) };
      cases.set(id, next);
      return next;
    },
    replaceCase: async (_ws: string, oldId: string, v: InsertCase) => {
      const row = rowFrom(v);
      cases.delete(oldId);
      cases.set(row.id, row);
      return row;
    },
    caseNames: async () => [...cases.values()].map((c) => c.name),
    getCaseBySourceFinding: async (_ws: string, findingId: string, owner: { kind: string; id: string }) =>
      [...cases.values()].find(
        (c) => c.sourceFindingId === findingId && c.ownerKind === owner.kind && c.ownerId === owner.id,
      ),
    findingContext: async (_ws: string, id: string) =>
      id === FINDING
        ? {
            finding: {
              id: FINDING,
              file: 'src/config.ts',
              startLine: 11,
              endLine: 11,
              severity: 'CRITICAL',
              category: 'security',
              title: 'Hardcoded key',
              kind: 'finding',
              acceptedAt: new Date(),
              dismissedAt: null,
            },
            agentId: AGENT,
            agentExists: true,
            agentName: 'agent',
            pull: { id: 'pr-1', number: 7, title: 'PR', body: null, base: 'main', headSha: 'abc' },
            repo: { owner: 'acme', name: 'x', fullName: 'acme/x' },
          }
        : undefined,
    findingSkills: async (_ws: string, id: string) =>
      id === FINDING ? { skills: [{ skillId: SKILL, name: 'a-skill', order: 0, caseId: null }] } : undefined,
    prFiles: async () => [{ path: 'src/config.ts', patch: PATCH }],
    caseSource: async () => undefined,
    latestFinishedRunRow: async () => undefined,
  };

  const guard = new Proxy(
    {
      evalRepo: repo,
      agentsRepo: { getById: async (_ws: string, id: string) => (id === AGENT ? { id, name: 'agent' } : undefined) },
      git: new MockGitClient({ diff: DIFF }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (typeof prop === 'string' && !(prop in target)) touched.push(prop);
        return target[prop as string];
      },
    },
  );

  return { service: new EvalService(guard as unknown as Container), cases, touched, repo: repo as unknown as EvalRepository };
}

describe('EvalService Case Editor (SPEC-09)', () => {
  let w: ReturnType<typeof makeWorld>;
  beforeEach(() => {
    w = makeWorld();
  });

  it('EC-1: 404 for an unknown owner comes BEFORE the byte cap', async () => {
    const huge = input({ input_diff: 'x'.repeat(204_801) });
    await expect(w.service.createManualCase(WS, { kind: 'skill', id: 'nope' }, huge)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(w.service.createManualCase(WS, { kind: 'agent', id: 'nope' }, huge)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('EC-1: the 204,800-byte cap is checked BEFORE parsing — an oversize non-diff is frozen_diff_too_large, not no_patch', async () => {
    await expect(
      w.service.createManualCase(WS, { kind: 'skill', id: SKILL }, input({ input_diff: 'x'.repeat(204_801) })),
    ).rejects.toMatchObject({ statusCode: 422, code: 'frozen_diff_too_large' });
    // the same garbage under the cap parses and is a no_patch
    await expect(
      w.service.createManualCase(WS, { kind: 'skill', id: SKILL }, input({ input_diff: 'x'.repeat(100) })),
    ).rejects.toMatchObject({ statusCode: 422, code: 'no_patch' });
    expect(w.cases.size).toBe(0);
  });

  it('EC-1: a PATCH with an oversize diff is frozen_diff_too_large', async () => {
    const created = await w.service.createManualCase(WS, { kind: 'skill', id: SKILL }, input());
    await expect(
      w.service.updateCase(WS, created.id, { input_diff: 'x'.repeat(204_801) }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'frozen_diff_too_large' });
  });

  it('AC-6/AC-46/EC-41: a CRLF hunks-only paste is stored as an LF git diff; must_not_flag stores null severity', async () => {
    const created = await w.service.createManualCase(
      WS,
      { kind: 'agent', id: AGENT },
      input({
        input_diff: PATCH.replace(/\n/g, '\r\n'),
        expectation: { type: 'must_not_flag', file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'bug' },
      }),
    );
    expect(created.input_diff).not.toContain('\r');
    expect(created.input_diff.startsWith('diff --git a/src/config.ts b/src/config.ts')).toBe(true);
    expect(created.expectation).toMatchObject({ type: 'must_not_flag', severity: null, category: null });
    expect(created.source_finding_id).toBeNull();
    expect(created.input_meta).toMatchObject({ pr_number: null, repo_full_name: null });
  });

  it('EC-3: a range outside the pasted diff is rejected and nothing is stored', async () => {
    await expect(
      w.service.createManualCase(
        WS,
        { kind: 'skill', id: SKILL },
        input({ expectation: { type: 'must_find', file: 'src/config.ts', start_line: 900, end_line: 901 } }),
      ),
    ).rejects.toMatchObject({ code: 'range_outside_diff', statusCode: 422 });
    expect(w.cases.size).toBe(0);
  });

  it('AC-14: an empty PATCH body is a validation error, not a no-op', async () => {
    const created = await w.service.createManualCase(WS, { kind: 'skill', id: SKILL }, input());
    await expect(w.service.updateCase(WS, created.id, {})).rejects.toMatchObject({ statusCode: 422 });
  });

  it('AC-14/AC-15: rename keeps the id; a changed diff replaces it and reports replaced_from_id', async () => {
    const created = await w.service.createManualCase(WS, { kind: 'skill', id: SKILL }, input());

    const renamed = await w.service.updateCase(WS, created.id, { name: 'renamed' });
    expect(renamed.id).toBe(created.id);
    expect(renamed.name).toBe('renamed');

    const replaced = await w.service.updateCase(WS, created.id, {
      expectation: { type: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 12 },
    });
    expect(replaced.id).not.toBe(created.id);
    expect(replaced.replaced_from_id).toBe(created.id);
    expect(replaced.created_at).toBe(created.created_at);
    expect(w.cases.has(created.id)).toBe(false);
  });

  it('EC-6: a finding-derived case rejects a diff edit with case_input_locked but accepts name and notes', async () => {
    const made = await w.service.createFromFindingForSkill(WS, FINDING, SKILL);
    await expect(
      w.service.updateCase(WS, made.case.id, { input_diff: `${DIFF}\n` + ' extra' }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'case_input_locked' });
    const ok = await w.service.updateCase(WS, made.case.id, { name: 'nice', notes: 'why' });
    expect(ok).toMatchObject({ id: made.case.id, name: 'nice', notes: 'why' });
  });

  it('AC-49/EC-39: finding → skill case is 201-style once, then returns the existing case unchanged', async () => {
    const first = await w.service.createFromFindingForSkill(WS, FINDING, SKILL);
    const again = await w.service.createFromFindingForSkill(WS, FINDING, SKILL);
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, case: { id: first.case.id } });
    expect(w.cases.size).toBe(1);
  });

  it('NFR-1: create, edit, delete, finding → skill case and every read never reach an LLM provider (or any other outside port)', async () => {
    const manual = await w.service.createManualCase(WS, { kind: 'agent', id: AGENT }, input());
    const skillCase = await w.service.createManualCase(WS, { kind: 'skill', id: SKILL }, input({ name: 'second' }));
    await w.service.updateCase(WS, manual.id, { name: 'r' }); // in place
    await w.service.updateCase(WS, skillCase.id, {
      expectation: { type: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 12 },
    }); // replace
    await w.service.createFromFindingForSkill(WS, FINDING, SKILL);
    await w.service.createFromFindingForSkill(WS, FINDING, SKILL); // repeat
    await w.service.listSkillCases(WS, SKILL);
    await w.service.listFindingSkills(WS, FINDING);
    await w.service.listCases(WS, AGENT);
    await w.service.getCase(WS, manual.id);
    await w.service.deleteCase(WS, manual.id);

    expect(w.touched.filter((p) => p !== 'then')).toEqual([]);
  });
});
