import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import type { EvalCaseDraft } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * SPEC-10 Phase A against a real Postgres: `GET /findings/:id/eval-case-draft`, the optional
 * `EvalCaseInput` of `POST /findings/:id/eval-case` and `POST /findings/:id/skill-eval-case`, the
 * finding-kind grounding of an edited draft, and the expectation title on `PATCH /eval-cases/:id`.
 * Self-skips without Docker. The LLM is a mock that must never be called (NFR-1); fixtures carry
 * placeholder secrets only (NFR-14). Hermetic counterpart: `src/modules/eval/draft.test.ts`.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[eval-draft] Docker not available — skipping integration tests.');

const CONFIG_PATCH = [
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');
const OTHER_PATCH = ['@@ -1,2 +1,3 @@', ' const a = 1;', '+const b = 2;', ' export {};'].join('\n');
const DIFF = [
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

d('SPEC-10 eval case draft and finding routes (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

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
  const makeApp = (llm = new MockLLMProvider('openai', { structured: {} })) =>
    buildApp({
      config: config(),
      db: db(),
      overrides: { git: new MockGitClient({ diff: DIFF }), github: new MockGitHubClient(), llm: { openai: llm } },
    });
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function makeAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Draft Agent ${++seq}-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a test reviewer.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  async function makeSkill(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: `draft-skill-${++seq}-${randomUUID().slice(0, 6)}`,
        description: 'A test skill',
        type: 'convention',
        body: 'Always check for null.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  /** A decided finding, its review and (optionally) the run whose skills the owner picker lists. */
  async function world(
    app: App,
    opts: {
      skills?: { id: string }[];
      findingOver?: Partial<typeof t.findings.$inferInsert>;
      ws?: string;
    } = {},
  ) {
    const ws = opts.ws ?? workspaceId;
    const agent = await makeAgent(app);
    const name = `draft-repo-${++seq}-${randomUUID().slice(0, 6)}`;
    const [repo] = await db()
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db()
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 2,
        deletions: 0,
        filesCount: 2,
        status: 'needs_review',
        body: 'Adds a limiter.',
      })
      .returning();
    const [run] = await db()
      .insert(t.agentRuns)
      .values({ workspaceId: ws, agentId: agent.id, prId: pr!.id, status: 'completed' })
      .returning();
    const skills = opts.skills ?? [];
    if (skills.length > 0) {
      await db()
        .insert(t.agentRunSkills)
        .values(skills.map((s, i) => ({ runId: run!.id, skillId: s.id, order: i })));
    }
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pr!.id, agentId: agent.id, kind: 'review', runId: run!.id })
      .returning();
    const [finding] = await db()
      .insert(t.findings)
      .values({
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe key',
        rationale: 'A key is committed.',
        confidence: 0.9,
        kind: 'finding',
        acceptedAt: new Date(),
        ...opts.findingOver,
      })
      .returning();
    return { agent, repo: repo!, pr: pr!, finding: finding! };
  }

  const getDraft = (app: App, findingId: string) =>
    app.inject({ method: 'GET', url: `/findings/${findingId}/eval-case-draft` });
  const postAgentCase = (app: App, findingId: string, payload?: object) =>
    app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case`, ...(payload ? { payload } : {}) });
  const postSkillCase = (app: App, findingId: string, skillId: string, input?: object) =>
    app.inject({
      method: 'POST',
      url: `/findings/${findingId}/skill-eval-case`,
      payload: { skill_id: skillId, ...(input ? { input } : {}) },
    });
  const casesOf = (findingId: string) =>
    db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, findingId));

  /** The editor's save body: the draft as an `EvalCaseInput`, optionally edited. */
  const inputFrom = (draft: EvalCaseDraft, over: Record<string, unknown> = {}) => ({
    name: draft.name,
    input_diff: draft.input_diff,
    input_meta: { title: draft.input_meta.title, body: draft.input_meta.body },
    expectation: { ...draft.expectation },
    ...over,
  });

  // =========================================================================
  // GET /findings/:id/eval-case-draft
  // =========================================================================

  describe('GET /findings/:id/eval-case-draft', () => {
    it('AC-2/AC-3/AC-4/NFR-1: 200 with the seed and the owners (agent, then skills in run order, with their case state); creates nothing and never reaches the LLM', async () => {
      const llm = new MockLLMProvider('openai', { structured: {} });
      const app = await makeApp(llm);
      const a = await makeSkill(app);
      const b = await makeSkill(app);
      const { agent, finding } = await world(app, { skills: [b, a] });
      const before = (await db().select({ n: count() }).from(t.evalCases))[0]!.n;

      const res = await getDraft(app, finding.id);
      expect(res.statusCode).toBe(200);
      const draft = res.json() as EvalCaseDraft;
      expect(draft.name).toBe('From finding: Hardcoded Stripe key');
      expect(draft.expectation).toEqual({
        type: 'must_find',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe key',
      });
      // only the finding's file is frozen
      expect(draft.input_diff).toContain('+++ b/src/config.ts');
      expect(draft.input_diff).not.toContain('src/other.ts');
      expect(draft.input_meta).toMatchObject({ pr_number: 482, title: 'Add rate limiting', body: 'Adds a limiter.' });
      expect(draft.owners).toEqual([
        { kind: 'agent', id: agent.id, name: agent.name, has_case: false, case_id: null },
        { kind: 'skill', id: b.id, name: b.name, has_case: false, case_id: null },
        { kind: 'skill', id: a.id, name: a.name, has_case: false, case_id: null },
      ]);

      expect((await db().select({ n: count() }).from(t.evalCases))[0]!.n).toBe(before);
      expect(llm.calls).toHaveLength(0);
      await app.close();
    });

    it('AC-3/AC-5: an owner that already has a case from the finding reports has_case and its case_id', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { agent, finding } = await world(app, { skills: [skill] });
      const agentCase = (await postAgentCase(app, finding.id)).json();
      const skillCase = (await postSkillCase(app, finding.id, skill.id)).json();

      const draft = (await getDraft(app, finding.id)).json() as EvalCaseDraft;
      expect(draft.owners).toEqual([
        { kind: 'agent', id: agent.id, name: agent.name, has_case: true, case_id: agentCase.id },
        { kind: 'skill', id: skill.id, name: skill.name, has_case: true, case_id: skillCase.id },
      ]);
      await app.close();
    });

    it('AC-2: a dismissed finding seeds a must_not_flag expectation', async () => {
      const app = await makeApp();
      const { finding } = await world(app, { findingOver: { acceptedAt: null, dismissedAt: new Date() } });
      const draft = (await getDraft(app, finding.id)).json();
      expect(draft.expectation.type).toBe('must_not_flag');
      await app.close();
    });

    it('AC-4/UI-6: the seeded name is cut to 80 characters in all, prefix included', async () => {
      const app = await makeApp();
      const { finding } = await world(app, { findingOver: { title: 'T'.repeat(200) } });
      const draft = (await getDraft(app, finding.id)).json();
      expect(draft.name).toHaveLength(80);
      expect(draft.name.startsWith('From finding: ')).toBe(true);
      await app.close();
    });

    it('EC-1/EC-2/EC-3: finding_undecided, no_patch, range_outside_diff and agent_missing are 422 with their codes', async () => {
      const app = await makeApp();
      const code = async (findingId: string) => {
        const r = await getDraft(app, findingId);
        return { status: r.statusCode, code: r.json().error?.code };
      };

      const undecided = await world(app, { findingOver: { acceptedAt: null, dismissedAt: null } });
      expect(await code(undecided.finding.id)).toEqual({ status: 422, code: 'finding_undecided' });

      const noPatch = await world(app, { findingOver: { file: 'src/not-in-the-diff.ts' } });
      expect(await code(noPatch.finding.id)).toEqual({ status: 422, code: 'no_patch' });

      const outside = await world(app, { findingOver: { startLine: 400, endLine: 410 } });
      expect(await code(outside.finding.id)).toEqual({ status: 422, code: 'range_outside_diff' });

      const orphan = await world(app);
      expect((await app.inject({ method: 'DELETE', url: `/agents/${orphan.agent.id}` })).statusCode).toBe(200);
      expect(await code(orphan.finding.id)).toEqual({ status: 422, code: 'agent_missing' });
      await app.close();
    });

    it('EC-4: the agent was deleted but the review recorded skills - 200, only those skills are owners', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { agent, finding } = await world(app, { skills: [skill] });
      expect((await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` })).statusCode).toBe(200);

      const res = await getDraft(app, finding.id);
      expect(res.statusCode).toBe(200);
      expect(res.json().owners).toEqual([{ kind: 'skill', id: skill.id, name: skill.name, has_case: false, case_id: null }]);
      await app.close();
    });

    it('EC-29/UI-8: an unknown finding or one of another workspace is 404; a non-UUID id is 422', async () => {
      const app = await makeApp();
      const [ws2] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
      const foreign = await world(app, { ws: ws2!.id });
      for (const id of [randomUUID(), foreign.finding.id]) {
        const res = await getDraft(app, id);
        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }
      expect((await getDraft(app, 'not-a-uuid')).statusCode).toBe(422);
      await app.close();
    });
  });

  // =========================================================================
  // POST /findings/:id/eval-case — optional input
  // =========================================================================

  describe('POST /findings/:id/eval-case', () => {
    it('AC-8: with no body it behaves as before - a slug name, the finding\'s own frozen file, 201 then 409 with the case id', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      const res = await postAgentCase(app, finding.id);
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: 'hardcoded-stripe-key',
        owner_kind: 'agent',
        source_finding_id: finding.id,
        expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 },
      });

      const again = await postAgentCase(app, finding.id);
      expect(again.statusCode).toBe(409);
      expect(again.json().error).toMatchObject({ code: 'eval_case_exists', details: { case_id: res.json().id } });
      expect(await casesOf(finding.id)).toHaveLength(1);
      await app.close();
    });

    it('AC-6/AC-7/AC-25: with the edited draft it stores that input - the editor\'s name, diff, title and title-bearing expectation - tied to the finding and its PR', async () => {
      const llm = new MockLLMProvider('openai', { structured: {} });
      const app = await makeApp(llm);
      const { agent, finding, repo } = await world(app);
      const draft = (await getDraft(app, finding.id)).json() as EvalCaseDraft;

      const res = await postAgentCase(
        app,
        finding.id,
        inputFrom(draft, {
          name: 'my edited case',
          notes: 'why this matters',
          input_meta: { title: 'Edited PR title', body: 'Edited body' },
          expectation: { ...draft.expectation, title: 'Edited expectation title' },
        }),
      );
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({
        name: 'my edited case',
        notes: 'why this matters',
        owner_kind: 'agent',
        owner_id: agent.id,
        source_finding_id: finding.id,
        input_meta: { pr_number: 482, repo_full_name: repo.fullName, title: 'Edited PR title', body: 'Edited body' },
        expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, title: 'Edited expectation title' },
      });
      expect(llm.calls).toHaveLength(0); // NFR-1
      await app.close();
    });

    it('EC-5: a second save for the same finding is a 409 eval_case_exists with the existing case id, and creates no second case', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      const draft = (await getDraft(app, finding.id)).json() as EvalCaseDraft;
      const first = await postAgentCase(app, finding.id, inputFrom(draft));
      expect(first.statusCode).toBe(201);
      const second = await postAgentCase(app, finding.id, inputFrom(draft, { name: 'other name' }));
      expect(second.statusCode).toBe(409);
      expect(second.json().error.details.case_id).toBe(first.json().id);
      expect(await casesOf(finding.id)).toHaveLength(1);
      await app.close();
    });

    it('EC-9: an edited location outside every hunk is 422 range_outside_diff and stores nothing', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      const draft = (await getDraft(app, finding.id)).json() as EvalCaseDraft;
      const res = await postAgentCase(
        app,
        finding.id,
        inputFrom(draft, { expectation: { ...draft.expectation, start_line: 300, end_line: 305 } }),
      );
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('range_outside_diff');
      expect(await casesOf(finding.id)).toEqual([]);
      await app.close();
    });

    it('UI-1/UI-8: a malformed body is 422 validation_error, a non-UUID id is 422, an unknown finding with a valid body is 404 - nothing stored', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      const draft = (await getDraft(app, finding.id)).json() as EvalCaseDraft;

      const bad = await postAgentCase(app, finding.id, { name: '' });
      expect(bad.statusCode).toBe(422);
      expect(bad.json().error.code).toBe('validation_error');
      expect((await postAgentCase(app, finding.id, inputFrom(draft, { expectation: { ...draft.expectation, start_line: 0 } }))).statusCode).toBe(422);
      expect((await postAgentCase(app, 'not-a-uuid')).statusCode).toBe(422);
      expect((await postAgentCase(app, randomUUID(), inputFrom(draft))).statusCode).toBe(404);
      expect(await casesOf(finding.id)).toEqual([]);
      await app.close();
    });

    it('EC-29: a finding of another workspace is 404 on the create route, with or without input', async () => {
      const app = await makeApp();
      const [ws2] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
      const mine = await world(app);
      const draft = (await getDraft(app, mine.finding.id)).json() as EvalCaseDraft;
      const foreign = await world(app, { ws: ws2!.id });
      expect((await postAgentCase(app, foreign.finding.id)).statusCode).toBe(404);
      expect((await postAgentCase(app, foreign.finding.id, inputFrom(draft))).statusCode).toBe(404);
      expect(await casesOf(foreign.finding.id)).toEqual([]);
      await app.close();
    });
  });

  // =========================================================================
  // POST /findings/:id/skill-eval-case — optional input
  // =========================================================================

  describe('POST /findings/:id/skill-eval-case', () => {
    it('AC-6/AC-7/EC-5: with input it is 201 and owned by the skill with the finding\'s PR facts; a repeat is 200 with the existing case, unchanged (agent 409 vs skill 200)', async () => {
      const llm = new MockLLMProvider('openai', { structured: {} });
      const app = await makeApp(llm);
      const skill = await makeSkill(app);
      const { finding, repo } = await world(app, { skills: [skill] });
      const draft = (await getDraft(app, finding.id)).json() as EvalCaseDraft;

      const first = await postSkillCase(app, finding.id, skill.id, inputFrom(draft, { name: 'skill edited' }));
      expect(first.statusCode).toBe(201);
      expect(first.json()).toMatchObject({
        name: 'skill edited',
        owner_kind: 'skill',
        owner_id: skill.id,
        source_finding_id: finding.id,
        input_meta: { pr_number: 482, repo_full_name: repo.fullName },
      });

      const again = await postSkillCase(app, finding.id, skill.id, inputFrom(draft, { name: 'a different name' }));
      expect(again.statusCode).toBe(200);
      expect(again.json()).toMatchObject({ id: first.json().id, name: 'skill edited' });
      expect(await casesOf(finding.id)).toHaveLength(1);
      expect(llm.calls).toHaveLength(0);
      await app.close();
    });

    it('AC-8: without input it keeps the SPEC-09 behaviour (slug name), 201 then 200', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { finding } = await world(app, { skills: [skill] });
      const first = await postSkillCase(app, finding.id, skill.id);
      expect(first.statusCode).toBe(201);
      expect(first.json().name).toBe('hardcoded-stripe-key');
      expect((await postSkillCase(app, finding.id, skill.id)).statusCode).toBe(200);
      await app.close();
    });

    it('EC-9 and a bad nested input: an edited location outside the hunks is 422 range_outside_diff; an invalid input is 422 validation_error', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { finding } = await world(app, { skills: [skill] });
      const draft = (await getDraft(app, finding.id)).json() as EvalCaseDraft;

      const outside = await postSkillCase(app, finding.id, skill.id, inputFrom(draft, { expectation: { ...draft.expectation, start_line: 90, end_line: 95 } }));
      expect(outside.statusCode).toBe(422);
      expect(outside.json().error.code).toBe('range_outside_diff');
      expect((await postSkillCase(app, finding.id, skill.id, { name: '' })).statusCode).toBe(422);
      expect(await casesOf(finding.id)).toEqual([]);
      await app.close();
    });

    it('EC-29: a finding of another workspace is 404', async () => {
      const app = await makeApp();
      const [ws2] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
      const skill = await makeSkill(app);
      const foreign = await world(app, { ws: ws2!.id, skills: [skill] });
      expect((await postSkillCase(app, foreign.finding.id, skill.id)).statusCode).toBe(404);
      await app.close();
    });
  });

  // =========================================================================
  // finding-kind grounding of an edited draft (AC-7, EC-9)
  // =========================================================================

  describe('finding-kind grounding', () => {
    it('a full-file kind (secret_leak / phantom) whose lines miss every hunk: the draft saves unedited (201) and an edited location gets the strict 422 range_outside_diff', async () => {
      const app = await makeApp();
      for (const kind of ['secret_leak', 'phantom'] as const) {
        const { finding } = await world(app, { findingOver: { kind, startLine: 400, endLine: 410 } });
        const draftRes = await getDraft(app, finding.id);
        expect(draftRes.statusCode, `${kind} draft`).toBe(200);
        const draft = draftRes.json() as EvalCaseDraft;

        // an edited location is no longer the finding's own -> the strict hunk-intersection rule
        const edited = await postAgentCase(app, finding.id, inputFrom(draft, { expectation: { ...draft.expectation, start_line: 500, end_line: 505 } }));
        expect(edited.statusCode, `${kind} edited`).toBe(422);
        expect(edited.json().error.code).toBe('range_outside_diff');
        expect(await casesOf(finding.id)).toEqual([]);

        // the unedited draft keeps the finding's kind and only needs the file present
        const saved = await postAgentCase(app, finding.id, inputFrom(draft));
        expect(saved.statusCode, `${kind} unedited`).toBe(201);
        expect(saved.json().expectation).toMatchObject({ file: 'src/config.ts', start_line: 400, end_line: 410 });
      }
      await app.close();
    });

    it('a plain `finding` kind with lines outside every hunk stays 422 range_outside_diff, on the draft and on a save of the same location', async () => {
      const app = await makeApp();
      const { finding } = await world(app, { findingOver: { kind: 'finding', startLine: 400, endLine: 410 } });
      const res = await getDraft(app, finding.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('range_outside_diff');

      const input = {
        name: 'forged draft',
        input_diff: ['diff --git a/src/config.ts b/src/config.ts', '--- a/src/config.ts', '+++ b/src/config.ts', CONFIG_PATCH].join('\n'),
        input_meta: { title: 'PR', body: null },
        expectation: { type: 'must_find', file: 'src/config.ts', start_line: 400, end_line: 410, severity: 'CRITICAL', category: 'security', title: null },
      };
      const save = await postAgentCase(app, finding.id, input);
      expect(save.statusCode).toBe(422);
      expect(save.json().error.code).toBe('range_outside_diff');
      expect(await casesOf(finding.id)).toEqual([]);
      await app.close();
    });
  });

  // =========================================================================
  // PATCH /eval-cases/:id — the expectation title (AC-25)
  // =========================================================================

  describe('PATCH /eval-cases/:id - expectation title', () => {
    const manualBody = (title: string | null) => ({
      name: 'manual-title-case',
      input_diff: DIFF,
      input_meta: { title: 'Add rate limiting', body: null },
      expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security', title },
    });
    const expectationPatch = (title?: string | null) => ({
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

    it('AC-25: on a manual case the title is persisted when changed, cleared by null and kept when omitted - in place, under the same id', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const created = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-cases`, payload: manualBody('First title') });
      expect(created.statusCode).toBe(201);
      const id = created.json().id as string;
      const titleOf = async () => ((await app.inject({ method: 'GET', url: `/eval-cases/${id}` })).json().expectation.title ?? null) as string | null;

      expect(await titleOf()).toBe('First title');

      const changed = await app.inject({ method: 'PATCH', url: `/eval-cases/${id}`, payload: expectationPatch('Second title') });
      expect(changed.statusCode).toBe(200);
      expect(changed.json().id).toBe(id);
      expect(changed.json().replaced_from_id ?? null).toBeNull();
      expect(await titleOf()).toBe('Second title');

      const omitted = await app.inject({ method: 'PATCH', url: `/eval-cases/${id}`, payload: expectationPatch() });
      expect(omitted.statusCode).toBe(200);
      expect(await titleOf()).toBe('Second title');

      const cleared = await app.inject({ method: 'PATCH', url: `/eval-cases/${id}`, payload: expectationPatch(null) });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().id).toBe(id);
      expect(await titleOf()).toBeNull();
      await app.close();
    });

    it('AC-25: on a finding-made case a changed title is 422 case_input_locked and the stored title is untouched; the unchanged echo is accepted', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      const created = (await postAgentCase(app, finding.id)).json();

      const locked = await app.inject({ method: 'PATCH', url: `/eval-cases/${created.id}`, payload: expectationPatch('A new title') });
      expect(locked.statusCode).toBe(422);
      expect(locked.json().error.code).toBe('case_input_locked');

      const echo = await app.inject({
        method: 'PATCH',
        url: `/eval-cases/${created.id}`,
        payload: { name: 'renamed', expectation: { ...expectationPatch('Hardcoded Stripe key').expectation } },
      });
      expect(echo.statusCode).toBe(200);
      const stored = (await app.inject({ method: 'GET', url: `/eval-cases/${created.id}` })).json();
      expect(stored.name).toBe('renamed');
      expect(stored.expectation.title).toBe('Hardcoded Stripe key');
      await app.close();
    });
  });
});
