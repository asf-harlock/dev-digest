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
 * SPEC-09 finding → skill eval case against a real Postgres:
 * GET /findings/:id/eval-skills and POST /findings/:id/skill-eval-case, incl.
 * the widened unique index of migration 0022 (EC-43) and the race (EC-39).
 * Self-skips without Docker. The LLM is a mock that must never be called
 * (NFR-1); fixtures carry placeholder secrets only.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) console.warn('[skill-eval] Docker not available — skipping integration tests.');

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

d('SPEC-09 finding → skill eval case (Testcontainers pg)', () => {
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
      overrides: { git: new MockGitClient({ diff: DIFF }), github: new MockGitHubClient(), llm: { openai: llm } },
    });
  type App = Awaited<ReturnType<typeof makeApp>>;

  async function makeAgent(app: App) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Skill Eval Agent ${++seq}-${randomUUID().slice(0, 6)}`,
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
        name: `fs-skill-${++seq}-${randomUUID().slice(0, 6)}`,
        description: 'A test skill',
        type: 'convention',
        body: 'Always check for null.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  async function makePr(ws = workspaceId) {
    const name = `fs-repo-${++seq}-${randomUUID().slice(0, 6)}`;
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
        body: null,
      })
      .returning();
    return { repo: repo!, pr: pr! };
  }

  /**
   * A decided finding whose review ran with `skills` (in that order) — the
   * `agent_run_skills` rows are what `GET /findings/:id/eval-skills` reads.
   */
  async function world(
    app: App,
    opts: { skills?: { id: string }[]; findingOver?: Partial<typeof t.findings.$inferInsert>; noRun?: boolean; ws?: string } = {},
  ) {
    const ws = opts.ws ?? workspaceId;
    const agent = await makeAgent(app);
    const { repo, pr } = await makePr(ws);
    let runId: string | null = null;
    if (!opts.noRun) {
      const [run] = await db()
        .insert(t.agentRuns)
        .values({ workspaceId: ws, agentId: agent.id, prId: pr.id, status: 'completed' })
        .returning();
      runId = run!.id;
      const skills = opts.skills ?? [];
      if (skills.length > 0) {
        await db()
          .insert(t.agentRunSkills)
          .values(skills.map((s, i) => ({ runId: runId!, skillId: s.id, order: i })));
      }
    }
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId: ws, prId: pr.id, agentId: agent.id, kind: 'review', runId })
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
    return { agent, repo, pr, review: review!, finding: finding! };
  }

  const post = (app: App, findingId: string, skillId: string) =>
    app.inject({ method: 'POST', url: `/findings/${findingId}/skill-eval-case`, payload: { skill_id: skillId } });

  const skillCases = (findingId: string) =>
    db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, findingId));

  // =========================================================================
  // GET /findings/:id/eval-skills
  // =========================================================================

  describe('GET /findings/:id/eval-skills', () => {
    it('AC-53: lists only the skills recorded for the review run, in run order, none with a case yet', async () => {
      const app = await makeApp();
      const a = await makeSkill(app);
      const b = await makeSkill(app);
      await makeSkill(app); // exists but was not in the run
      const { finding } = await world(app, { skills: [b, a] });

      const res = await app.inject({ method: 'GET', url: `/findings/${finding.id}/eval-skills` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        skills: [
          { skill_id: b.id, name: b.name, has_case: false, case_id: null },
          { skill_id: a.id, name: a.name, has_case: false, case_id: null },
        ],
      });
      await app.close();
    });

    it('EC-36: a review with no recorded run (or a run with no skills) → an empty list, not an error', async () => {
      const app = await makeApp();
      const noRun = await world(app, { noRun: true });
      const noSkills = await world(app, { skills: [] });
      for (const { finding } of [noRun, noSkills]) {
        const res = await app.inject({ method: 'GET', url: `/findings/${finding.id}/eval-skills` });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ skills: [] });
      }
      await app.close();
    });

    it('AC-53: a skill that already has a case from this finding reports has_case and case_id', async () => {
      const app = await makeApp();
      const a = await makeSkill(app);
      const b = await makeSkill(app);
      const { finding } = await world(app, { skills: [a, b] });
      const created = (await post(app, finding.id, a.id)).json();

      const res = await app.inject({ method: 'GET', url: `/findings/${finding.id}/eval-skills` });
      expect(res.json().skills).toEqual([
        { skill_id: a.id, name: a.name, has_case: true, case_id: created.id },
        { skill_id: b.id, name: b.name, has_case: false, case_id: null },
      ]);
      await app.close();
    });

    it('EC-32: 404 for an unknown finding and for a finding of another workspace', async () => {
      const app = await makeApp();
      const [ws2] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
      const foreign = await world(app, { ws: ws2!.id });
      for (const id of [randomUUID(), foreign.finding.id]) {
        expect((await app.inject({ method: 'GET', url: `/findings/${id}/eval-skills` })).statusCode).toBe(404);
      }
      await app.close();
    });
  });

  // =========================================================================
  // POST /findings/:id/skill-eval-case
  // =========================================================================

  describe('POST /findings/:id/skill-eval-case', () => {
    it('AC-49/AC-50: an accepted finding becomes a must_find case owned by the skill, frozen to its own file; 201 first, 200 on repeat', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { finding, pr, repo } = await world(app, { skills: [skill] });

      const res = await post(app, finding.id, skill.id);
      expect(res.statusCode).toBe(201);
      const c = res.json();
      expect(c).toMatchObject({
        owner_kind: 'skill',
        owner_id: skill.id,
        name: 'hardcoded-stripe-key',
        source_finding_id: finding.id,
        expectation: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11, severity: 'CRITICAL', category: 'security', title: 'Hardcoded Stripe key' },
        input_meta: { pr_number: pr.number, repo_full_name: repo.fullName, title: 'Add rate limiting' },
      });
      expect(c.input_diff).toContain('sk_live_xxx');
      expect(c.input_diff).not.toContain('src/other.ts');

      const again = await post(app, finding.id, skill.id);
      expect(again.statusCode).toBe(200);
      expect(again.json().id).toBe(c.id);
      expect(await skillCases(finding.id)).toHaveLength(1);

      // it reads back through the skill's list and detail, with the source PR
      const list = await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` });
      expect(list.json()).toHaveLength(1);
      expect(list.json()[0]).toMatchObject({ id: c.id, source_finding_id: finding.id, latest_result: null });
      const detail = await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` });
      expect(detail.json().source).toMatchObject({ repo_id: repo.id, pr_number: pr.number });
      await app.close();
    });

    it('AC-50: a dismissed finding becomes a must_not_flag case', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { finding } = await world(app, { skills: [skill], findingOver: { acceptedAt: null, dismissedAt: new Date() } });
      const res = await post(app, finding.id, skill.id);
      expect(res.statusCode).toBe(201);
      expect(res.json().expectation).toMatchObject({ type: 'must_not_flag', file: 'src/config.ts' });
      await app.close();
    });

    it('EC-35: an undecided finding is 422 finding_undecided and creates nothing', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { finding } = await world(app, { skills: [skill], findingOver: { acceptedAt: null, dismissedAt: null } });
      const res = await post(app, finding.id, skill.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('finding_undecided');
      expect(await skillCases(finding.id)).toHaveLength(0);
      await app.close();
    });

    it('EC-37: a skill that was not part of the run is 422 skill_not_in_run', async () => {
      const app = await makeApp();
      const inRun = await makeSkill(app);
      const notInRun = await makeSkill(app);
      const { finding } = await world(app, { skills: [inRun] });
      const res = await post(app, finding.id, notInRun.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('skill_not_in_run');
      expect(await skillCases(finding.id)).toHaveLength(0);
      await app.close();
    });

    it('EC-37: check order — finding_undecided is reported before skill_not_in_run', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { finding } = await world(app, { skills: [], findingOver: { acceptedAt: null } });
      const res = await post(app, finding.id, skill.id);
      expect(res.json().error.code).toBe('finding_undecided');
      await app.close();
    });

    it('EC-32: 404 for an unknown finding, an unknown skill, a skill of another workspace and a finding of another workspace', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { finding } = await world(app, { skills: [skill] });
      const [ws2] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
      const [foreignSkill] = await db()
        .insert(t.skills)
        .values({ workspaceId: ws2!.id, name: `foreign-${randomUUID().slice(0, 6)}`, description: 'd', type: 'custom', source: 'manual', body: 'b' })
        .returning();
      const foreign = await world(app, { ws: ws2!.id, skills: [foreignSkill!] });

      expect((await post(app, randomUUID(), skill.id)).statusCode).toBe(404);
      expect((await post(app, finding.id, randomUUID())).statusCode).toBe(404);
      expect((await post(app, finding.id, foreignSkill!.id)).statusCode).toBe(404);
      expect((await post(app, foreign.finding.id, foreignSkill!.id)).statusCode).toBe(404);
      expect(await skillCases(finding.id)).toHaveLength(0);
      expect(await skillCases(foreign.finding.id)).toHaveLength(0);
      await app.close();
    });

    it('AC-49: a body without a UUID skill_id is 422 validation_error', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      for (const payload of [{}, { skill_id: 'not-a-uuid' }]) {
        const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/skill-eval-case`, payload });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('validation_error');
      }
      await app.close();
    });

    it('EC-5: a finding on a file that is not in the PR diff is 422 no_patch; lines outside the hunk are range_outside_diff', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const gone = await world(app, { skills: [skill], findingOver: { file: 'src/gone.ts' } });
      const outside = await world(app, { skills: [skill], findingOver: { startLine: 900, endLine: 905 } });

      const a = await post(app, gone.finding.id, skill.id);
      expect(a.statusCode).toBe(422);
      expect(a.json().error.code).toBe('no_patch');
      const b = await post(app, outside.finding.id, skill.id);
      expect(b.statusCode).toBe(422);
      expect(b.json().error.code).toBe('range_outside_diff');
      expect(await skillCases(gone.finding.id)).toHaveLength(0);
      expect(await skillCases(outside.finding.id)).toHaveLength(0);
      await app.close();
    });

    it('EC-39: two simultaneous requests create exactly one case; the loser answers 200 with the same id', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { finding } = await world(app, { skills: [skill] });

      const results = await Promise.all([post(app, finding.id, skill.id), post(app, finding.id, skill.id), post(app, finding.id, skill.id)]);
      const statuses = results.map((r) => r.statusCode).sort();
      expect(statuses.every((s) => s === 200 || s === 201)).toBe(true);
      expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(1);
      expect(new Set(results.map((r) => r.json().id)).size).toBe(1);
      expect(await skillCases(finding.id)).toHaveLength(1);
      await app.close();
    });

    it('EC-43: an agent case AND a skill case from the same finding coexist (unique index widened by migration 0022)', async () => {
      const app = await makeApp();
      const skill = await makeSkill(app);
      const { finding, agent } = await world(app, { skills: [skill] });

      const agentRes = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
      expect(agentRes.statusCode).toBe(201);
      const skillRes = await post(app, finding.id, skill.id);
      expect(skillRes.statusCode).toBe(201);

      const rows = await skillCases(finding.id);
      expect(rows.map((r) => `${r.ownerKind}:${r.ownerId}`).sort()).toEqual([`agent:${agent.id}`, `skill:${skill.id}`].sort());
      expect(agentRes.json().id).not.toBe(skillRes.json().id);

      // each owner still holds at most one: the agent path stays 409, the skill path stays 200
      const agentAgain = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
      expect(agentAgain.statusCode).toBe(409);
      expect(agentAgain.json().error).toMatchObject({ code: 'eval_case_exists', details: { case_id: agentRes.json().id } });
      expect((await post(app, finding.id, skill.id)).statusCode).toBe(200);
      expect(await skillCases(finding.id)).toHaveLength(2);

      // the agent's list holds only its own case; the skill's list only the skill's
      const agentList = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      const skillList = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` })).json();
      expect(agentList.map((c: { id: string }) => c.id)).toEqual([agentRes.json().id]);
      expect(skillList.map((c: { id: string }) => c.id)).toEqual([skillRes.json().id]);
      await app.close();
    });

    it('EC-43: the same finding gives each of two skills in the run its own case', async () => {
      const app = await makeApp();
      const a = await makeSkill(app);
      const b = await makeSkill(app);
      const { finding } = await world(app, { skills: [a, b] });
      const [ra, rb] = [await post(app, finding.id, a.id), await post(app, finding.id, b.id)];
      expect([ra.statusCode, rb.statusCode]).toEqual([201, 201]);
      expect(ra.json().id).not.toBe(rb.json().id);
      expect(await skillCases(finding.id)).toHaveLength(2);
      await app.close();
    });

    it('EC-23: deleting the skill removes its finding-derived case and the skill drops out of the finding\'s menu data', async () => {
      const app = await makeApp();
      const a = await makeSkill(app);
      const b = await makeSkill(app);
      const { finding } = await world(app, { skills: [a, b] });
      await post(app, finding.id, a.id);
      await post(app, finding.id, b.id);

      expect((await app.inject({ method: 'DELETE', url: `/skills/${a.id}` })).statusCode).toBe(200);

      const rows = await skillCases(finding.id);
      expect(rows.map((r) => r.ownerId)).toEqual([b.id]);
      const menu = (await app.inject({ method: 'GET', url: `/findings/${finding.id}/eval-skills` })).json();
      expect(menu.skills.map((s: { skill_id: string }) => s.skill_id)).toEqual([b.id]);
      await app.close();
    });
  });

  describe('NFR-1: no model call', () => {
    it('NFR-1: eval-skills, finding → skill case (201 and repeat 200) and the reads never reach the LLM provider', async () => {
      const provider = new MockLLMProvider('openai', { structured: {} });
      const app = await buildApp({
        config: config(),
        db: db(),
        overrides: { git: new MockGitClient({ diff: DIFF }), github: new MockGitHubClient(), llm: { openai: provider } },
      });
      const skill = await makeSkill(app);
      const { finding } = await world(app, { skills: [skill] });

      await app.inject({ method: 'GET', url: `/findings/${finding.id}/eval-skills` });
      const created = (await post(app, finding.id, skill.id)).json();
      await post(app, finding.id, skill.id);
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/eval-cases` });
      await app.inject({ method: 'GET', url: `/eval-cases/${created.id}` });
      await app.inject({ method: 'DELETE', url: `/eval-cases/${created.id}` });

      expect(provider.calls).toEqual([]);
      await app.close();
    });
  });
});
