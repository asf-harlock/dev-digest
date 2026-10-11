import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * SPEC-09 Case Editor routes against a real Postgres: manual cases for agents
 * and skills, PATCH edit rule (in place vs replace vs locked), the size and
 * grounding rejections, workspace scoping and the skill-delete cascade.
 * Self-skips without Docker. The LLM is a mock that must never be called
 * (NFR-1); fixtures carry placeholder secrets only.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-cases] Docker not available — skipping integration tests.');

const CONFIG_PATCH = [
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');
const OTHER_PATCH = ['@@ -1,2 +1,3 @@', ' const a = 1;', '+const b = 2;', ' export {};'].join('\n');
const MULTI_FILE = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  CONFIG_PATCH,
  'diff --git a/src/other.ts b/src/other.ts',
  '--- a/src/other.ts',
  '+++ b/src/other.ts',
  OTHER_PATCH,
].join('\n');

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('SPEC-09 eval case routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;
  const llm = new MockLLMProvider('openai', { structured: {} });

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const db = () => pg.handle.db;
  const makeApp = () =>
    buildApp({
      config: config(),
      db: db(),
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openai: llm } },
    });
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function makeAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Case Agent ${++seq}-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a test reviewer.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  async function makeSkill(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `case-skill-${++seq}-${randomUUID().slice(0, 6)}`,
        description: 'A test skill',
        type: 'convention',
        body: 'Always check for null.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string };
  }

  const body = (over: Record<string, unknown> = {}) => ({
    name: `manual-${++seq}`,
    notes: 'a note',
    input_diff: CONFIG_PATCH,
    input_meta: { title: 'Add the key', body: 'because' },
    expectation: {
      type: 'must_find',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      severity: 'CRITICAL',
      category: 'security',
    },
    ...over,
  });

  const caseRows = (ownerId: string) =>
    db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, ownerId));

  /** A second workspace with its own agent + skill, for the EC-32 scoping checks. */
  async function foreignOwners() {
    const [ws] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
    const [agent] = await db()
      .insert(t.agents)
      .values({ workspaceId: ws!.id, name: 'foreign', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'x' })
      .returning();
    const [skill] = await db()
      .insert(t.skills)
      .values({ workspaceId: ws!.id, name: `foreign-${randomUUID().slice(0, 6)}`, description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    return { agentId: agent!.id, skillId: skill!.id };
  }

  // =========================================================================
  // POST /agents/:id/eval-cases  and  POST /skills/:id/eval-cases
  // =========================================================================

  describe('POST /agents/:id/eval-cases', () => {
    it('AC-9/AC-11: 201 with a manual case — no PR, no source finding, hunks-only paste wrapped in git headers', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: body() });
      expect(res.statusCode).toBe(201);
      const c = res.json();
      expect(c).toMatchObject({
        owner_kind: 'agent',
        owner_id: agent.id,
        source_finding_id: null,
        notes: 'a note',
        input_meta: { pr_number: null, repo_full_name: null, title: 'Add the key', body: 'because' },
        expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security' },
      });
      expect(c.input_diff.startsWith('diff --git a/src/config.ts b/src/config.ts')).toBe(true);
      expect(c.input_diff).toContain('sk_live_xxx');

      // it shows up in the agent's list and reads back with no source PR
      const list = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
      expect(list.json().map((x: { id: string }) => x.id)).toContain(c.id);
      const detail = await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().source).toBeNull();
      await app.close();
    });

    it('AC-10/AC-46: a CRLF multi-file paste freezes only the chosen file, stored with LF endings', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: body({
          input_diff: MULTI_FILE.replace(/\n/g, '\r\n'),
          expectation: { type: 'must_not_flag', file: 'src/other.ts', start_line: 2, end_line: 2, severity: 'SUGGESTION', category: 'bug' },
        }),
      });
      expect(res.statusCode).toBe(201);
      const c = res.json();
      expect(c.input_diff).not.toContain('\r');
      expect(c.input_diff).toContain('+++ b/src/other.ts');
      expect(c.input_diff).not.toContain('src/config.ts');
      // EC-41: severity / category only exist on must_find
      expect(c.expectation).toMatchObject({ type: 'must_not_flag', severity: null, category: null });
      await app.close();
    });

    it('EC-32: 404 for an unknown agent and for an agent of another workspace — nothing is stored', async () => {
      const app = await makeApp();
      const foreign = await foreignOwners();
      for (const id of [randomUUID(), foreign.agentId]) {
        const res = await app.inject({ method: 'POST', url: `/agents/${id}/eval-cases`, payload: body() });
        expect(res.statusCode).toBe(404);
      }
      expect(await caseRows(foreign.agentId)).toHaveLength(0);
      await app.close();
    });
  });

  describe('POST /skills/:id/eval-cases and GET /skills/:id/eval-cases', () => {
    it('AC-9/AC-54: 201 creates a skill-owned case; the list returns it newest first with latest_result null', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const first = (await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-cases`, payload: body({ name: 'first' }) })).json();
      await new Promise((r) => setTimeout(r, 5));
      const secondRes = await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-cases`, payload: body({ name: 'second' }) });
      expect(secondRes.statusCode).toBe(201);
      const second = secondRes.json();
      expect(second).toMatchObject({ owner_kind: 'skill', owner_id: skill.id, source_finding_id: null });
      expect(second.input_meta).toMatchObject({ pr_number: null, repo_full_name: null });

      const list = await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` });
      expect(list.statusCode).toBe(200);
      const items = list.json() as { id: string; name: string; latest_result: unknown; source_finding_id: string | null }[];
      expect(items.map((i) => i.id)).toEqual([second.id, first.id]);
      expect(items[0]).toMatchObject({ name: 'second', latest_result: null, source_finding_id: null });
      expect(items[0]!.latest_result).toBeNull();
      await app.close();
    });

    it('AC-54: a skill\'s list never includes an agent\'s cases, and the agent\'s list never includes the skill\'s', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const agent = await makeAgent(app);
      const sc = (await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-cases`, payload: body() })).json();
      const ac = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: body() })).json();

      const skillIds = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` })).json().map((x: { id: string }) => x.id);
      const agentIds = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json().map((x: { id: string }) => x.id);
      expect(skillIds).toEqual([sc.id]);
      expect(agentIds).toEqual([ac.id]);
      await app.close();
    });

    it('EC-32: 404 for an unknown skill and a skill of another workspace (create and list)', async () => {
      const app = await makeApp();
      const foreign = await foreignOwners();
      for (const id of [randomUUID(), foreign.skillId]) {
        expect((await app.inject({ method: 'POST', url: `/skills/${id}/eval-cases`, payload: body() })).statusCode).toBe(404);
        expect((await app.inject({ method: 'GET', url: `/skills/${id}/eval-cases` })).statusCode).toBe(404);
      }
      expect(await caseRows(foreign.skillId)).toHaveLength(0);
      await app.close();
    });
  });

  // =========================================================================
  // Rejections: validation, size, grounding
  // =========================================================================

  describe('rejections', () => {
    it('EC-1: a diff over 204,800 bytes is 422 frozen_diff_too_large and nothing is stored', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const res = await app.inject({
        method: 'POST',
        url: `/skills/${skill.id}/eval-cases`,
        payload: body({ input_diff: `${CONFIG_PATCH}\n${'x'.repeat(300_000)}` }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('frozen_diff_too_large');
      expect(await caseRows(skill.id)).toHaveLength(0);
      await app.close();
    });

    it('EC-1: exactly at the cap is NOT rejected for size (it then fails grounding, not frozen_diff_too_large)', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const res = await app.inject({
        method: 'POST',
        url: `/skills/${skill.id}/eval-cases`,
        payload: body({ input_diff: 'x'.repeat(204_800) }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('no_patch');
      await app.close();
    });

    it('EC-42: a body over the 1 MiB server limit is 413 payload_too_large (not a 500)', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const res = await app.inject({
        method: 'POST',
        url: `/skills/${skill.id}/eval-cases`,
        payload: body({ input_diff: 'x'.repeat(1_100_000) }),
      });
      expect(res.statusCode).toBe(413);
      expect(res.json().error.code).toBe('payload_too_large');
      expect(await caseRows(skill.id)).toHaveLength(0);
      await app.close();
    });

    it('EC-2: a chosen file that is not in the diff is 422 no_patch', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const res = await app.inject({
        method: 'POST',
        url: `/skills/${skill.id}/eval-cases`,
        // a full multi-file paste does not contain the chosen file (bare hunks would take the typed path)
        payload: body({
          input_diff: MULTI_FILE,
          expectation: { type: 'must_find', file: 'src/missing.ts', start_line: 1, end_line: 1 },
        }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('no_patch');
      await app.close();
    });

    it('EC-3: lines outside every hunk are 422 range_outside_diff', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/eval-cases`,
        payload: body({ expectation: { type: 'must_find', file: 'src/config.ts', start_line: 900, end_line: 905 } }),
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('range_outside_diff');
      expect(await caseRows(agent.id)).toHaveLength(0);
      await app.close();
    });

    it('AC-9: invalid fields (end before start, empty name, name over 80) are 422 validation_error', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const bad = [
        body({ expectation: { type: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 11 } }),
        body({ name: '' }),
        body({ name: 'n'.repeat(81) }),
        body({ input_meta: { title: '', body: null } }),
      ];
      for (const payload of bad) {
        const res = await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-cases`, payload });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('validation_error');
      }
      expect(await caseRows(skill.id)).toHaveLength(0);
      await app.close();
    });
  });

  // =========================================================================
  // PATCH /eval-cases/:id
  // =========================================================================

  describe('PATCH /eval-cases/:id', () => {
    async function manualCase(app: App, kind: 'agent' | 'skill' = 'skill') {
      const owner = kind === 'skill' ? await makeSkill(app) : await makeAgent(app);
      const res = await app.inject({ method: 'POST', url: `/${kind}s/${owner.id}/eval-cases`, payload: body() });
      expect(res.statusCode).toBe(201);
      return { owner, created: res.json() };
    }

    it('AC-14: name / notes / severity / category edit in place — same id, same row', async () => {
      const app = await makeApp();
      const { created } = await manualCase(app);
      const res = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${created.id}`,
        payload: {
          name: 'renamed',
          notes: 'new note',
          expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'SUGGESTION', category: 'bug' },
        },
      });
      expect(res.statusCode).toBe(200);
      const c = res.json();
      expect(c).toMatchObject({ id: created.id, name: 'renamed', notes: 'new note' });
      expect(c.expectation).toMatchObject({ severity: 'SUGGESTION', category: 'bug' });
      expect(c.replaced_from_id ?? null).toBeNull();
      expect(c.input_diff).toBe(created.input_diff);
      await app.close();
    });

    it('AC-14: a rename on the agent tab\'s `{ name }` body still works (backward compatible)', async () => {
      const app = await makeApp();
      const { created } = await manualCase(app, 'agent');
      const res = await app.inject({ method: 'PATCH', url: `/eval-cases/${created.id}`, payload: { name: 'just-a-rename' } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: created.id, name: 'just-a-rename' });
      await app.close();
    });

    it('AC-14: echoing every field back unchanged is an in-place edit, not a replace', async () => {
      const app = await makeApp();
      const { created } = await manualCase(app);
      const res = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${created.id}`,
        payload: {
          name: 'echo',
          input_diff: created.input_diff,
          input_meta: { title: created.input_meta.title, body: created.input_meta.body },
          expectation: created.expectation,
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(created.id);
      await app.close();
    });

    it('AC-15: a changed diff/lines replaces the case — new id, same created_at, replaced_from_id, old id gone', async () => {
      const app = await makeApp();
      const { owner, created } = await manualCase(app);
      const res = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${created.id}`,
        payload: {
          input_diff: MULTI_FILE,
          expectation: { type: 'must_find', file: 'src/other.ts', start_line: 2, end_line: 2, severity: 'SUGGESTION', category: 'bug' },
        },
      });
      expect(res.statusCode).toBe(200);
      const c = res.json();
      expect(c.id).not.toBe(created.id);
      expect(c.replaced_from_id).toBe(created.id);
      expect(c.created_at).toBe(created.created_at);
      expect(c.input_diff).toContain('+++ b/src/other.ts');
      expect(c.input_diff).not.toContain('sk_live_xxx');
      // unspecified fields keep their stored value
      expect(c).toMatchObject({ name: created.name, notes: 'a note', owner_kind: 'skill', owner_id: owner.id });

      expect((await app.inject({ method: 'GET', url: `/eval-cases/${created.id}` })).statusCode).toBe(404);
      expect(await caseRows(owner.id)).toHaveLength(1);
      await app.close();
    });

    it('AC-15/EC-3: a replacing edit that does not ground is rejected and the old case survives untouched', async () => {
      const app = await makeApp();
      const { owner, created } = await manualCase(app);
      const res = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${created.id}`,
        payload: { expectation: { type: 'must_find', file: 'src/config.ts', start_line: 900, end_line: 901 } },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('range_outside_diff');
      const rows = await caseRows(owner.id);
      expect(rows.map((r) => r.id)).toEqual([created.id]);
      await app.close();
    });

    it('AC-14: an empty body is 422 validation_error', async () => {
      const app = await makeApp();
      const { created } = await manualCase(app);
      const res = await app.inject({ method: 'PATCH', url: `/eval-cases/${created.id}`, payload: {} });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('validation_error');
      await app.close();
    });

    it('EC-1: a PATCH diff over 204,800 bytes is 422 frozen_diff_too_large', async () => {
      const app = await makeApp();
      const { created } = await manualCase(app);
      const res = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${created.id}`,
        payload: { input_diff: `${CONFIG_PATCH}\n${'x'.repeat(300_000)}` },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('frozen_diff_too_large');
      await app.close();
    });

    it('EC-6: a finding-derived case is 422 case_input_locked for a diff, lines or severity edit — but name and notes are allowed', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const [row] = await db()
        .insert(t.evalCases)
        .values({
          workspaceId,
          ownerKind: 'skill',
          ownerId: skill.id,
          name: 'from-finding',
          inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${CONFIG_PATCH}`,
          inputFiles: ['src/config.ts'],
          inputMeta: { pr_number: 3, repo_full_name: 'acme/x', title: 'T', body: null },
          expectedOutput: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security', title: 'Hardcoded key' },
          sourceFindingId: randomUUID(),
        })
        .returning();
      const url = `/eval-cases/${row!.id}`;
      const expectation = row!.expectedOutput;

      const locked = [
        { input_diff: `${row!.inputDiff}\n+extra` },
        { expectation: { ...expectation, start_line: 10 } },
        { expectation: { ...expectation, severity: 'SUGGESTION' } },
        { expectation: { ...expectation, category: 'bug' } },
        { input_meta: { title: 'Another title', body: null } },
      ];
      for (const payload of locked) {
        const res = await app.inject({ method: 'PATCH', url, payload });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('case_input_locked');
      }

      const ok = await app.inject({ method: 'PATCH', url, payload: { name: 'renamed-ok', notes: 'still editable' } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ id: row!.id, name: 'renamed-ok', notes: 'still editable' });
      // the stored input is untouched
      const [after] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, row!.id));
      expect(after!.expectedOutput).toMatchObject({ severity: 'CRITICAL', start_line: 11 });
      await app.close();
    });

    it('EC-32: 404 for an unknown case id and for a case of another workspace', async () => {
      const app = await makeApp();
      const foreign = await foreignOwners();
      const [other] = await db()
        .insert(t.evalCases)
        .values({
          workspaceId: (await db().select().from(t.skills).where(eq(t.skills.id, foreign.skillId)))[0]!.workspaceId,
          ownerKind: 'skill',
          ownerId: foreign.skillId,
          name: 'foreign-case',
          inputDiff: CONFIG_PATCH,
          inputFiles: ['src/config.ts'],
          inputMeta: { title: 'T', body: null },
          expectedOutput: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 },
        })
        .returning();
      for (const id of [randomUUID(), other!.id]) {
        expect((await app.inject({ method: 'PATCH', url: `/eval-cases/${id}`, payload: { name: 'x' } })).statusCode).toBe(404);
      }
      const [still] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, other!.id));
      expect(still!.name).toBe('foreign-case');
      await app.close();
    });
  });

  // =========================================================================
  // Skill delete cascade, NFR-1
  // =========================================================================

  describe('DELETE /skills/:id', () => {
    it('EC-23: deleting a skill removes its eval cases and leaves other skills\' and agents\' cases alone', async () => {
      const app = await makeApp();
      const doomed = await makeSkill(app);
      const keeper = await makeSkill(app);
      const agent = await makeAgent(app);
      for (const url of [`/skills/${doomed.id}/eval-cases`, `/skills/${doomed.id}/eval-cases`, `/skills/${keeper.id}/eval-cases`, `/agents/${agent.id}/eval-cases`]) {
        expect((await app.inject({ method: 'POST', url, payload: body() })).statusCode).toBe(201);
      }
      expect(await caseRows(doomed.id)).toHaveLength(2);

      const del = await app.inject({ method: 'DELETE', url: `/skills/${doomed.id}` });
      expect(del.statusCode).toBe(200);

      expect(await caseRows(doomed.id)).toHaveLength(0);
      expect(await caseRows(keeper.id)).toHaveLength(1);
      expect(await caseRows(agent.id)).toHaveLength(1);
      expect((await app.inject({ method: 'GET', url: `/skills/${doomed.id}/eval-cases` })).statusCode).toBe(404);
      await app.close();
    });

    it('EC-23: deleting an unknown skill is 404 and deletes no cases', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-cases`, payload: body() });
      expect((await app.inject({ method: 'DELETE', url: `/skills/${randomUUID()}` })).statusCode).toBe(404);
      expect(await caseRows(skill.id)).toHaveLength(1);
      await app.close();
    });
  });

  describe('NFR-1: no model call', () => {
    it('NFR-1: create, edit (in place and replace), list, read and delete never reach the LLM provider', async () => {
      const provider = new MockLLMProvider('openai', { structured: {} });
      const app = await buildApp({
        config: config(),
        db: db(),
        overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openai: provider } },
      });
      const skill = await makeSkill(app);
      const agent = await makeAgent(app);

      const sc = (await app.inject({ method: 'POST', url: `/skills/${skill.id}/eval-cases`, payload: body() })).json();
      const ac = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: body() })).json();
      await app.inject({ method: 'PATCH', url: `/eval-cases/${sc.id}`, payload: { name: 'r' } });
      const replaced = (
        await app.inject({
          method: 'PATCH',
          url: `/eval-cases/${sc.id}`,
          payload: { expectation: { type: 'must_find', file: 'src/config.ts', start_line: 12, end_line: 12 } },
        })
      ).json();
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` });
      await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` });
      await app.inject({ method: 'GET', url: `/eval-cases/${replaced.id}` });
      await app.inject({ method: 'DELETE', url: `/eval-cases/${ac.id}` });
      await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` });

      expect(provider.calls).toEqual([]);
      await app.close();
    });
  });
});
