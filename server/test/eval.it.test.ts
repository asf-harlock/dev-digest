import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { count, eq } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type {
  EvalCaseOutcome,
  EvalExpectation,
  EvalMetrics,
  EvalRunSnapshot,
  Review,
  StructuredRequest,
  StructuredResult,
  UnifiedDiff,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { errorCaseOutcome, scoreCase, scoreRun } from '../src/modules/eval/scoring.js';

/**
 * SPEC-08 eval pipeline — route behaviour against a real Postgres. Self-skips
 * without Docker. The LLM is a mock; fixtures carry placeholder secrets only
 * (`sk_live_xxx`, NFR-14).
 *
 * Eval runs execute in a detached promise after `POST /agents/:id/eval-runs`
 * answers 202, so tests poll `GET /eval-runs/:id` (see `waitForRun`) and use a
 * gated LLM to hold a run open deterministically.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[eval] Docker not available — skipping integration tests.');
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONFIG_PATCH = [
  '@@ -10,3 +10,4 @@',
  '   port: 3000,',
  '+  stripeKey: "sk_live_xxx",',
  '   redisUrl: x,',
].join('\n');
const OTHER_PATCH = ['@@ -1,2 +1,3 @@', ' const a = 1;', '+const b = 2;', ' export {};'].join('\n');

/** A two-file PR diff: a frozen case must only ever contain the finding's own file. */
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

/** One grounded finding on src/config.ts:11, one hallucinated line. */
const REVIEW: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe key.',
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

const NO_FINDINGS: Review = { verdict: 'approve', summary: 'ok', score: 95, findings: [] };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A mock LLM that can be held open (`gate`) or made to fail (`failOn`) per call. */
class ScriptedLLM extends MockLLMProvider {
  /** Calls that reached the provider, counted on entry (before the gate). */
  entered = 0;
  gate: Promise<void> | undefined;
  failOn: (callNo: number) => boolean = () => false;

  constructor(structured: unknown = REVIEW) {
    super('openai', { structured });
  }

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const callNo = ++this.entered;
    if (this.gate) await this.gate;
    if (this.failOn(callNo)) throw new Error(`provider boom ${callNo}`);
    return super.completeStructured<T>(req);
  }
}

/** A git client with no usable diff, to exercise the persisted-`pr_files` fallback. */
class NoDiffGit extends MockGitClient {
  override async diff(): Promise<UnifiedDiff> {
    throw new Error('no clone available');
  }
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const BASE_SNAPSHOT: EvalRunSnapshot = {
  provider: 'openai',
  model: 'gpt-4.1',
  strategy: 'single-pass',
  system_prompt: 'line one\nline two',
  skills: [],
};

const metricsWith = (recall: number | null): EvalMetrics => ({
  ...scoreRun([]),
  recall: { value: recall, num: recall === null ? 0 : 1, den: recall === null ? 0 : 1 },
});

// ---------------------------------------------------------------------------
// Main suite
// ---------------------------------------------------------------------------

d('SPEC-08 eval routes (Testcontainers pg)', () => {
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

  type App = Awaited<ReturnType<typeof makeApp>>;
  function makeApp(llm: MockLLMProvider = new ScriptedLLM(), git: MockGitClient = new MockGitClient({ diff: DIFF })) {
    return buildApp({
      config: config(),
      db: db(),
      overrides: { git, github: new MockGitHubClient(), llm: { openai: llm } },
    });
  }

  // ---- seeding helpers ------------------------------------------------------

  async function makeAgent(app: App, over: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Eval Agent ${++seq}-${randomUUID().slice(0, 6)}`,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a test reviewer.',
        ...over,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string; version: number; model: string };
  }

  async function makePr(ws = workspaceId) {
    const name = `eval-repo-${++seq}-${randomUUID().slice(0, 6)}`;
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
        body: 'Add rate limiting. Closes #471.',
      })
      .returning();
    await db().insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/config.ts', additions: 1, deletions: 0, patch: CONFIG_PATCH },
      { prId: pr!.id, path: 'src/other.ts', additions: 1, deletions: 0, patch: OTHER_PATCH },
    ]);
    return { repo: repo!, pr: pr! };
  }

  async function makeReview(prId: string, agentId: string | null, ws = workspaceId) {
    const [review] = await db()
      .insert(t.reviews)
      .values({ workspaceId: ws, prId, agentId, kind: 'review' })
      .returning();
    return review!;
  }

  async function makeFinding(
    reviewId: string,
    over: Partial<typeof t.findings.$inferInsert> = {},
  ) {
    const [f] = await db()
      .insert(t.findings)
      .values({
        reviewId,
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
        ...over,
      })
      .returning();
    return f!;
  }

  /** Agent + PR + review + one decided finding. */
  async function world(app: App, findingOver: Partial<typeof t.findings.$inferInsert> = {}) {
    const agent = await makeAgent(app);
    const { repo, pr } = await makePr();
    const review = await makeReview(pr.id, agent.id);
    const finding = await makeFinding(review.id, findingOver);
    return { agent, repo, pr, review, finding };
  }

  async function createCase(app: App, findingId: string) {
    const res = await app.inject({ method: 'POST', url: `/findings/${findingId}/eval-case` });
    expect(res.statusCode).toBe(201);
    return res.json() as {
      id: string;
      name: string;
      owner_id: string;
      input_diff: string;
      expectation: EvalExpectation & { severity: string; category: string; title: string };
    };
  }

  async function insertCaseRow(ownerId: string, over: Partial<typeof t.evalCases.$inferInsert> = {}) {
    const [row] = await db()
      .insert(t.evalCases)
      .values({
        workspaceId,
        ownerKind: 'agent',
        ownerId,
        name: `case-${++seq}`,
        inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${CONFIG_PATCH}`,
        inputFiles: ['src/config.ts'],
        inputMeta: { pr_number: 1, repo_full_name: 'acme/x', title: 'T', body: null },
        expectedOutput: { type: 'must_find', file: 'src/config.ts', start_line: 11, end_line: 11 },
        ...over,
      })
      .returning();
    return row!;
  }

  interface RunSeed {
    status?: 'running' | 'completed' | 'partial' | 'errored';
    ranAt?: Date;
    version?: number;
    snapshot?: EvalRunSnapshot;
    outcomes?: EvalCaseOutcome[];
    caseSet?: { id: string; name: string }[];
    metrics?: EvalMetrics | null;
    costUsd?: number | null;
    ws?: string;
  }
  function runValues(agentId: string, o: RunSeed = {}): typeof t.evalRuns.$inferInsert {
    const status = o.status ?? 'completed';
    const outcomes = o.outcomes ?? [];
    const metrics = o.metrics === undefined ? (status === 'completed' || status === 'partial' ? scoreRun(outcomes) : null) : o.metrics;
    return {
      workspaceId: o.ws ?? workspaceId,
      agentId,
      status,
      agentVersion: o.version ?? 1,
      snapshot: o.snapshot ?? BASE_SNAPSHOT,
      caseSet: o.caseSet ?? outcomes.map((c) => ({ id: c.case_id, name: c.name })),
      caseResults: outcomes,
      metricParts: metrics,
      tracesPassed: metrics?.traces_passed ?? null,
      tracesTotal: metrics?.traces_total ?? null,
      casesErrored: metrics?.cases_errored ?? 0,
      recall: metrics?.recall.value ?? null,
      precision: metrics?.precision.value ?? null,
      citationAccuracy: metrics?.citation_accuracy.value ?? null,
      ranAt: o.ranAt ?? new Date(),
      finishedAt: status === 'running' ? null : (o.ranAt ?? new Date()),
      durationMs: status === 'running' ? null : 1000,
      costUsd: o.costUsd === undefined ? 0.01 : o.costUsd,
      errorReason: status === 'errored' ? 'boom' : null,
    };
  }
  async function insertRun(agentId: string, o: RunSeed = {}) {
    const [row] = await db().insert(t.evalRuns).values(runValues(agentId, o)).returning();
    return row!;
  }

  const outcome = (
    caseId: string,
    type: 'must_find' | 'must_not_flag',
    findingLines: number[],
    grounding?: { kept: number; total: number },
  ): EvalCaseOutcome =>
    scoreCase({
      caseId,
      name: `n-${caseId}`,
      expectation: { type, file: 'src/config.ts', start_line: 10, end_line: 12 },
      findings: findingLines.map((l) => ({
        file: 'src/config.ts',
        start_line: l,
        end_line: l,
        title: 't',
        severity: 'INFO',
        category: 'bug',
      })),
      groundingKept: grounding?.kept ?? findingLines.length,
      groundingTotal: grounding?.total ?? findingLines.length,
      durationMs: 5,
      costUsd: 0.001,
    });

  async function waitForRun(app: App, runId: string, timeoutMs = 15_000) {
    const start = Date.now();
    for (;;) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${runId}` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      if (body.status !== 'running') return body;
      if (Date.now() - start > timeoutMs) throw new Error(`run ${runId} still running after ${timeoutMs}ms`);
      await sleep(25);
    }
  }

  async function tableCounts() {
    const n = async (table: PgTable) => (await db().select({ n: count() }).from(table))[0]!.n;
    return {
      reviews: await n(t.reviews),
      findings: await n(t.findings),
      agentRuns: await n(t.agentRuns),
      agentRunSkills: await n(t.agentRunSkills),
      runTraces: await n(t.runTraces),
      pulls: (await db().select({ id: t.pullRequests.id, sha: t.pullRequests.lastReviewedSha }).from(t.pullRequests)).sort(
        (a, b) => a.id.localeCompare(b.id),
      ),
    };
  }

  // =========================================================================
  // POST /findings/:id/eval-case
  // =========================================================================

  describe('POST /findings/:id/eval-case', () => {
    it('AC-2/AC-4/AC-5/AC-6/AC-7: an accepted finding becomes a must_find case frozen to its own file only', async () => {
      const app = await makeApp();
      const { agent, pr, repo, finding } = await world(app);

      const res = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
      expect(res.statusCode).toBe(201);
      const c = res.json();
      expect(c).toMatchObject({
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'hardcoded-stripe-key',
        source_finding_id: finding.id,
        expectation: {
          type: 'must_find',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe key',
        },
        input_meta: {
          pr_number: pr.number,
          repo_full_name: repo.fullName,
          title: 'Add rate limiting',
          body: 'Add rate limiting. Closes #471.',
        },
      });
      // AC-4: headers + every hunk of that file, nothing of the PR's other file
      expect(c.input_diff).toContain('diff --git a/src/config.ts b/src/config.ts');
      expect(c.input_diff).toContain('+++ b/src/config.ts');
      expect(c.input_diff).toContain('sk_live_xxx');
      expect(c.input_diff).not.toContain('src/other.ts');
      await app.close();
    });

    it('AC-3: a dismissed finding becomes a must_not_flag case', async () => {
      const app = await makeApp();
      const { finding } = await world(app, { acceptedAt: null, dismissedAt: new Date() });
      const c = await createCase(app, finding.id);
      expect(c.expectation).toMatchObject({ type: 'must_not_flag', file: 'src/config.ts', start_line: 11, end_line: 11 });
      await app.close();
    });

    it('EC-6: a full-file kind (secret_leak) only needs its file in the diff, whatever its lines', async () => {
      const app = await makeApp();
      const { finding } = await world(app, { kind: 'secret_leak', startLine: 900, endLine: 905 });
      const c = await createCase(app, finding.id);
      expect(c.expectation).toMatchObject({ start_line: 900, end_line: 905 });
      await app.close();
    });

    it('AC-6: two findings with the same title get name, name-2, name-3', async () => {
      const app = await makeApp();
      const { agent, review, finding } = await world(app);
      const second = await makeFinding(review.id, { startLine: 12, endLine: 12 });
      const third = await makeFinding(review.id, { startLine: 11, endLine: 12 });
      const names = [
        (await createCase(app, finding.id)).name,
        (await createCase(app, second.id)).name,
        (await createCase(app, third.id)).name,
      ];
      expect(names).toEqual(['hardcoded-stripe-key', 'hardcoded-stripe-key-2', 'hardcoded-stripe-key-3']);
      expect(agent.id).toBeTruthy();
      await app.close();
    });

    it('AC-6/UI-6: a hostile title is reduced to a slug of a-z, 0-9 and "-" within 60 chars', async () => {
      const app = await makeApp();
      const { finding } = await world(app, { title: `<script>alert("sk_live_xxx")</script> ${'long '.repeat(30)}` });
      const c = await createCase(app, finding.id);
      expect(c.name).toMatch(/^[a-z0-9-]{1,60}$/);
      await app.close();
    });

    it('EC-3: one case per source finding — a second request is 409 eval_case_exists with the existing id', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      const first = await createCase(app, finding.id);

      const again = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
      expect(again.statusCode).toBe(409);
      expect(again.json().error).toMatchObject({ code: 'eval_case_exists', details: { case_id: first.id } });

      const rows = await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
      expect(rows).toHaveLength(1);
      await app.close();
    });

    it('EC-3: two simultaneous requests create exactly one case (unique index backs the pre-check)', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      const [a, b] = await Promise.all([
        app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` }),
        app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` }),
      ]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409]);
      const winner = [a, b].find((r) => r.statusCode === 201)!.json();
      const loser = [a, b].find((r) => r.statusCode === 409)!.json();
      expect(loser.error).toMatchObject({ code: 'eval_case_exists', details: { case_id: winner.id } });
      const rows = await db().select().from(t.evalCases).where(eq(t.evalCases.sourceFindingId, finding.id));
      expect(rows).toHaveLength(1);
      await app.close();
    });

    it('EC-1/EC-2/EC-4/EC-5: each rejection carries its code and creates nothing', async () => {
      const app = await makeApp();
      const post = (id: string) => app.inject({ method: 'POST', url: `/findings/${id}/eval-case` });
      const before = (await db().select({ n: count() }).from(t.evalCases))[0]!.n;

      // EC-1 undecided
      const { agent, pr, review } = await world(app);
      const undecided = await makeFinding(review.id, { acceptedAt: null, dismissedAt: null });
      let res = await post(undecided.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('finding_undecided');

      // EC-2 review without an agent / with a deleted agent
      const noAgentReview = await makeReview(pr.id, null);
      res = await post((await makeFinding(noAgentReview.id)).id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('agent_missing');
      const ghostReview = await makeReview(pr.id, randomUUID());
      res = await post((await makeFinding(ghostReview.id)).id);
      expect(res.json().error.code).toBe('agent_missing');

      // EC-4 file not in the diff
      res = await post((await makeFinding(review.id, { file: 'src/missing.ts' })).id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('no_patch');

      // EC-5 file present but the range misses every hunk
      res = await post((await makeFinding(review.id, { startLine: 500, endLine: 510 })).id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('range_outside_diff');

      expect((await db().select({ n: count() }).from(t.evalCases))[0]!.n).toBe(before);
      expect(agent.id).toBeTruthy();
      await app.close();
    });

    it('EC-35: with several failing checks the first in 404 → undecided → agent_missing → exists → no_patch → range wins', async () => {
      const app = await makeApp();
      const post = (id: string) => app.inject({ method: 'POST', url: `/findings/${id}/eval-case` });
      const code = async (id: string) => {
        const r = await post(id);
        return { status: r.statusCode, body: r.json() };
      };
      const { agent, pr, review } = await world(app);
      const ghostReview = await makeReview(pr.id, randomUUID());

      // 404 beats everything
      expect((await code(randomUUID())).status).toBe(404);

      // undecided AND agent missing AND file missing → finding_undecided
      const f1 = await makeFinding(ghostReview.id, { acceptedAt: null, file: 'src/missing.ts' });
      expect((await code(f1.id)).body.error.code).toBe('finding_undecided');

      // agent missing AND a case already exists AND file missing → agent_missing
      const f2 = await makeFinding(ghostReview.id, { file: 'src/missing.ts' });
      await insertCaseRow(randomUUID(), { sourceFindingId: f2.id });
      expect((await code(f2.id)).body.error.code).toBe('agent_missing');

      // case already exists AND file missing → 409 (before no_patch)
      const f3 = await makeFinding(review.id, { file: 'src/missing.ts' });
      const existing = await insertCaseRow(agent.id, { sourceFindingId: f3.id });
      const r3 = await code(f3.id);
      expect(r3.status).toBe(409);
      expect(r3.body.error).toMatchObject({ code: 'eval_case_exists', details: { case_id: existing.id } });

      // file missing AND range outside → no_patch (before range_outside_diff)
      const f4 = await makeFinding(review.id, { file: 'src/missing.ts', startLine: 900, endLine: 901 });
      expect((await code(f4.id)).body.error.code).toBe('no_patch');
      await app.close();
    });

    it('AC-4: falls back to the persisted pr_files patches when git has no diff', async () => {
      const app = await makeApp(new ScriptedLLM(), new NoDiffGit());
      const { finding } = await world(app);
      const c = await createCase(app, finding.id);
      expect(c.input_diff).toContain('sk_live_xxx');
      expect(c.input_diff).not.toContain('src/other.ts');
      await app.close();
    });

    it('EC-7: flipping the finding decision afterwards leaves the case expectation unchanged', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      const c = await createCase(app, finding.id);
      await db()
        .update(t.findings)
        .set({ acceptedAt: null, dismissedAt: new Date() })
        .where(eq(t.findings.id, finding.id));
      const got = await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` });
      expect(got.json().expectation.type).toBe('must_find');
      await app.close();
    });

    it('EC-8: the case outlives its finding, review and PR — source becomes null', async () => {
      const app = await makeApp();
      const { review, finding } = await world(app);
      const c = await createCase(app, finding.id);

      const before = await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` });
      expect(before.json().source).toMatchObject({ pr_number: 482 });
      expect(typeof before.json().source.repo_id).toBe('string');

      await db().delete(t.reviews).where(eq(t.reviews.id, review.id)); // cascades the finding
      const after = await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` });
      expect(after.statusCode).toBe(200);
      expect(after.json().source).toBeNull();
      expect(after.json().input_diff).toContain('sk_live_xxx');
      await app.close();
    });
  });

  describe('GET /pulls/:id/eval-case-links', () => {
    it('AC-61: lists the findings of that PR that already have a case, with the case and agent ids', async () => {
      const app = await makeApp();
      const { agent, pr, review, finding } = await world(app);
      const other = await makeFinding(review.id, { startLine: 12, endLine: 12 }); // no case
      const c = await createCase(app, finding.id);

      const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/eval-case-links` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        links: [{ finding_id: finding.id, case_id: c.id, agent_id: agent.id }],
      });
      expect(res.json().links.map((l: { finding_id: string }) => l.finding_id)).not.toContain(other.id);

      // a PR with no cases → empty, not 404
      const { pr: emptyPr } = await makePr();
      const empty = await app.inject({ method: 'GET', url: `/pulls/${emptyPr.id}/eval-case-links` });
      expect(empty.json()).toEqual({ links: [] });
      await app.close();
    });
  });

  // =========================================================================
  // Case CRUD
  // =========================================================================

  describe('eval case CRUD', () => {
    it('AC-55: lists the agent cases newest first; latest_result is null until a finished run includes the case', async () => {
      const app = await makeApp();
      const { agent, review, finding } = await world(app);
      const second = await makeFinding(review.id, { title: 'Second thing', startLine: 12, endLine: 12 });
      const c1 = await createCase(app, finding.id);
      await sleep(5);
      const c2 = await createCase(app, second.id);

      let list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(list.map((c: { id: string }) => c.id)).toEqual([c2.id, c1.id]);
      expect(list.every((c: { latest_result: unknown }) => c.latest_result === null)).toBe(true);
      expect(list[0]).toMatchObject({ name: c2.name, expectation: { type: 'must_find' } });

      const run = await insertRun(agent.id, {
        outcomes: [outcome(c1.id, 'must_find', [11]), errorCaseOutcome(c2.id, c2.name, 'must_find', 'boom', 3)],
      });
      list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      const byId = Object.fromEntries(list.map((c: { id: string }) => [c.id, c]));
      expect(byId[c1.id].latest_result).toMatchObject({ run_id: run.id, state: 'passed', expected_count: 1, got_count: 1 });
      expect(byId[c2.id].latest_result).toMatchObject({ state: 'errored', expected_count: null, error_reason: 'boom' });

      // a case added after the run was not in it → null ("never run")
      const third = await makeFinding(review.id, { title: 'Third thing', startLine: 10, endLine: 10 });
      const c3 = await createCase(app, third.id);
      list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(list.find((c: { id: string }) => c.id === c3.id).latest_result).toBeNull();
      await app.close();
    });

    it('AC-56: GET /eval-cases/:id returns the full case, its source and its latest result', async () => {
      const app = await makeApp();
      const { agent, repo, finding } = await world(app);
      const c = await createCase(app, finding.id);
      await insertRun(agent.id, { outcomes: [outcome(c.id, 'must_find', [99])] });

      const res = await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        id: c.id,
        input_diff: c.input_diff,
        source: { repo_id: repo.id, pr_number: 482 },
        latest_result: { state: 'failed', expected_count: 1, got_count: 0 },
      });
      await app.close();
    });

    it('AC-15/EC-32: rename persists, and a name another case already has is accepted', async () => {
      const app = await makeApp();
      const { agent, review, finding } = await world(app);
      const other = await makeFinding(review.id, { title: 'Other', startLine: 12, endLine: 12 });
      const c1 = await createCase(app, finding.id);
      const c2 = await createCase(app, other.id);

      const res = await app.inject({ method: 'PATCH', url: `/eval-cases/${c1.id}`, payload: { name: 'my-renamed-case' } });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('my-renamed-case');
      const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
      expect(list.map((c: { name: string }) => c.name)).toContain('my-renamed-case');

      const dup = await app.inject({ method: 'PATCH', url: `/eval-cases/${c2.id}`, payload: { name: 'my-renamed-case' } });
      expect(dup.statusCode).toBe(200);
      await app.close();
    });

    it('EC-30/UI-7: an empty name or one over 80 characters is 422 validation_error and changes nothing', async () => {
      const app = await makeApp();
      const { finding } = await world(app);
      const c = await createCase(app, finding.id);
      for (const name of ['', 'x'.repeat(81)]) {
        const res = await app.inject({ method: 'PATCH', url: `/eval-cases/${c.id}`, payload: { name } });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('validation_error');
      }
      const ok = await app.inject({ method: 'PATCH', url: `/eval-cases/${c.id}`, payload: { name: 'x'.repeat(80) } });
      expect(ok.statusCode).toBe(200);
      const [row] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, c.id));
      expect(row!.name).toBe('x'.repeat(80));
      await app.close();
    });

    it('AC-17/AC-18: delete removes the case but leaves every past run result and metric unchanged', async () => {
      const app = await makeApp();
      const { agent, finding } = await world(app);
      const c = await createCase(app, finding.id);
      const run = await insertRun(agent.id, { outcomes: [outcome(c.id, 'must_find', [11])] });
      const before = (await app.inject({ method: 'GET', url: `/eval-runs/${run.id}` })).json();

      const del = await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` });
      expect(del.statusCode).toBe(204);
      expect((await app.inject({ method: 'GET', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${c.id}` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json()).toEqual([]);

      const after = (await app.inject({ method: 'GET', url: `/eval-runs/${run.id}` })).json();
      expect(after).toEqual(before);
      expect(after.case_results).toHaveLength(1);

      // the source finding can be turned into a case again
      const again = await app.inject({ method: 'POST', url: `/findings/${finding.id}/eval-case` });
      expect(again.statusCode).toBe(201);
      await app.close();
    });
  });

  // =========================================================================
  // Running the set
  // =========================================================================

  describe('POST /agents/:id/eval-runs', () => {
    /** An agent with `n` cases: case 0 = must_find config.ts:11, case 1 = must_not_flag other.ts. */
    async function agentWithCases(app: App, n = 2) {
      const agent = await makeAgent(app);
      const { pr } = await makePr();
      const review = await makeReview(pr.id, agent.id);
      const cases: Awaited<ReturnType<typeof createCase>>[] = [];
      const specs: Partial<typeof t.findings.$inferInsert>[] = [
        { title: 'Case one config' },
        { title: 'Case two other', file: 'src/other.ts', startLine: 2, endLine: 2, acceptedAt: null, dismissedAt: new Date() },
        { title: 'Case three config', startLine: 10, endLine: 12 },
      ];
      for (let i = 0; i < n; i++) {
        const f = await makeFinding(review.id, specs[i % specs.length]!);
        cases.push(await createCase(app, f.id));
        await sleep(3); // distinct created_at → deterministic run order
      }
      return { agent, cases };
    }

    it('EC-11: an agent with no cases cannot run (422 no_eval_cases); an unknown agent is 404', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('no_eval_cases');
      expect((await app.inject({ method: 'POST', url: `/agents/${randomUUID()}/eval-runs` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: '/agents/not-a-uuid/eval-runs' })).statusCode).toBe(422);
      await app.close();
    });

    it('AC-19..AC-24/AC-58/NFR-2/NFR-4: 202 first, then one review per case on the frozen input, with metrics, snapshot and no writes to review tables', async () => {
      const llm = new ScriptedLLM(REVIEW);
      const app = await makeApp(llm);
      const { agent, cases } = await agentWithCases(app, 2);

      // a skill linked to the agent must reach the snapshot AND the prompt
      const [skill] = await db()
        .insert(t.skills)
        .values({ workspaceId, name: `eval-skill-${seq}`, description: 'd', type: 'convention', source: 'manual', body: 'Never commit credentials.', enabled: true })
        .returning();
      await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skills: [{ skill_id: skill!.id, enabled: true }] } });
      const agentNow = (await app.inject({ method: 'GET', url: `/agents/${agent.id}` })).json();

      const before = await tableCounts();
      const start = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(start.statusCode).toBe(202);
      expect(start.json()).toMatchObject({ status: 'running' });
      const runId = start.json().id as string;

      const run = await waitForRun(app, runId);
      expect(run).toMatchObject({
        id: runId,
        agent_id: agent.id,
        agent_name: agent.name,
        status: 'completed',
        agent_version: agentNow.version,
        cases_total: 2,
        cases_done: 2,
      });
      expect(run.finished_at).not.toBeNull();
      expect(run.duration_ms).toBeGreaterThanOrEqual(0);
      expect(run.cost_usd).toBeCloseTo(0.002, 6);

      // AC-20 snapshot, AC-21 case set (in run order)
      expect(run.snapshot).toEqual({
        provider: 'openai',
        model: 'gpt-4.1',
        strategy: agentNow.strategy,
        system_prompt: 'You are a test reviewer.',
        skills: [{ name: skill!.name, body: 'Never commit credentials.' }],
      });
      expect(run.case_set).toEqual(cases.map((c) => ({ id: c.id, name: c.name })));

      // AC-23/AC-27/AC-28: per-case results
      const [r1, r2] = run.case_results;
      expect(r1).toMatchObject({ case_id: cases[0]!.id, status: 'scored', pass: true, expected_count: 1, got_count: 1, grounding_kept: 1, grounding_total: 2 });
      expect(r1.findings).toEqual([expect.objectContaining({ file: 'src/config.ts', start_line: 11, label: 'tp' })]);
      // case 2's frozen diff is src/other.ts only, so the model's src/config.ts finding is dropped by grounding
      expect(r2).toMatchObject({ case_id: cases[1]!.id, status: 'scored', pass: true, expected_count: 0, got_count: 0, grounding_kept: 0, grounding_total: 2 });

      // AC-30..AC-34 metrics (+ numerators / denominators)
      expect(run.metrics).toMatchObject({
        recall: { value: 1, num: 1, den: 1 },
        precision: { value: 1, num: 1, den: 1 },
        citation_accuracy: { value: 0.25, num: 1, den: 4 },
        tp: 1,
        fp: 0,
        unlabeled: 0,
        traces_passed: 2,
        traces_total: 2,
        cases_errored: 0,
      });

      // AC-22/NFR-2: exactly one structured call per case, cases one at a time, frozen input only
      expect(llm.calls.map((c) => c.method)).toEqual(['completeStructured', 'completeStructured']);
      const prompts = llm.calls.map((c) => {
        const req = c.req as StructuredRequest<unknown>;
        return { model: req.model, system: req.messages[0]!.content as string, user: req.messages[1]!.content as string };
      });
      expect(prompts[0]!.model).toBe('gpt-4.1');
      expect(prompts[0]!.system.startsWith('You are a test reviewer.')).toBe(true);
      expect(prompts[0]!.user).toContain('src/config.ts');
      expect(prompts[0]!.user).not.toContain('src/other.ts');
      expect(prompts[1]!.user).toContain('src/other.ts');
      expect(prompts[1]!.user).not.toContain('sk_live_xxx');
      for (const p of prompts) {
        expect(p.user).toContain('Review pull request "Add rate limiting".');
        expect(p.user).toContain('Add rate limiting. Closes #471.'); // frozen body as PR description
        expect(p.user).toContain(`### ${skill!.name}\nNever commit credentials.`);
        for (const h of ['## Repo skeleton', '## PR context', '## Project context', '## Declared intent & scope', '## Callers of changed symbols']) {
          expect(p.user).not.toContain(h);
        }
      }

      // NFR-4: nothing written to the live review tables, last_reviewed_sha untouched
      expect(await tableCounts()).toEqual(before);
      await app.close();
    });

    it('EC-12/EC-13: every case errored → run errored, metrics null, first reason on the run, nothing scored', async () => {
      const llm = new ScriptedLLM(REVIEW);
      llm.failOn = () => true;
      const app = await makeApp(llm);
      const { agent } = await agentWithCases(app, 2);
      const { id } = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
      const run = await waitForRun(app, id);
      expect(run).toMatchObject({ status: 'errored', metrics: null, error_reason: 'provider boom 1', cost_usd: null });
      expect(run.case_results).toHaveLength(2);
      expect(run.case_results.every((r: EvalCaseOutcome) => r.status === 'errored' && r.pass === null && r.got_count === null)).toBe(true);
      await app.close();
    });

    it('EC-12/AC-24: one errored case → partial; the errored case is excluded from every metric', async () => {
      const llm = new ScriptedLLM(REVIEW);
      llm.failOn = (n) => n === 1;
      const app = await makeApp(llm);
      const { agent, cases } = await agentWithCases(app, 2);
      const { id } = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
      const run = await waitForRun(app, id);
      expect(run.status).toBe('partial');
      expect(run.case_results[0]).toMatchObject({ case_id: cases[0]!.id, status: 'errored', error_reason: 'provider boom 1' });
      expect(run.metrics).toMatchObject({
        traces_total: 1,
        traces_passed: 1,
        cases_errored: 1,
        recall: { value: null, num: 0, den: 0 }, // the only must_find case errored → EC-19
      });
      await app.close();
    });

    it('EC-19: a run whose model returns no findings stores null precision, never 0%', async () => {
      const app = await makeApp(new ScriptedLLM(NO_FINDINGS));
      const { agent } = await agentWithCases(app, 1);
      const { id } = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
      const run = await waitForRun(app, id);
      expect(run.status).toBe('completed');
      expect(run.metrics.recall).toEqual({ value: 0, num: 0, den: 1 });
      expect(run.metrics.precision).toEqual({ value: null, num: 0, den: 0 });
      expect(run.metrics.citation_accuracy).toEqual({ value: null, num: 0, den: 0 });
      await app.close();
    });

    it('EC-10/EC-37/EC-17/AC-25: single-flight — two simultaneous starts make one run; the run finishes with its start-time snapshot', async () => {
      const llm = new ScriptedLLM(REVIEW);
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { agent } = await agentWithCases(app, 2);

      const [a, b] = await Promise.all([
        app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` }),
        app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` }),
      ]);
      expect([a.statusCode, b.statusCode].sort()).toEqual([202, 409]);
      const accepted = [a, b].find((r) => r.statusCode === 202)!.json();
      const rejected = [a, b].find((r) => r.statusCode === 409)!.json();
      expect(rejected.error).toMatchObject({ code: 'eval_run_in_progress', details: { run_id: accepted.id } });
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(1);

      // EC-10: a later start while it runs is rejected the same way
      const later = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(later.statusCode).toBe(409);
      expect(later.json().error.details.run_id).toBe(accepted.id);

      // AC-25: progress is visible while running; overview exposes the running id
      const mid = (await app.inject({ method: 'GET', url: `/eval-runs/${accepted.id}` })).json();
      expect(mid).toMatchObject({ status: 'running', cases_total: 2, cases_done: 0, metrics: null, finished_at: null });
      const overview = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-overview` })).json();
      expect(overview.running_run_id).toBe(accepted.id);

      // EC-17: the agent changes mid-run; the run keeps the snapshot taken at its start
      const edit = await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { model: 'gpt-4o', system_prompt: 'A different prompt.' } });
      expect(edit.statusCode).toBe(200);
      gate.resolve();
      const run = await waitForRun(app, accepted.id);
      expect(run.status).toBe('completed');
      expect(run.snapshot).toMatchObject({ model: 'gpt-4.1', system_prompt: 'You are a test reviewer.' });
      expect(run.agent_version).toBe(agent.version);
      for (const c of llm.calls) {
        const req = c.req as StructuredRequest<unknown>;
        expect(req.model).toBe('gpt-4.1');
        expect(req.messages[0]!.content as string).toContain('You are a test reviewer.');
      }

      // once it has finished, a new run may start
      const next = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(next.statusCode).toBe(202);
      await waitForRun(app, next.json().id);
      await app.close();
    });

    it('EC-28: a disabled agent can still be evaluated', async () => {
      const app = await makeApp();
      const { agent } = await agentWithCases(app, 1);
      await app.inject({ method: 'PUT', url: `/agents/${agent.id}`, payload: { enabled: false } });
      const res = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
      expect(res.statusCode).toBe(202);
      await waitForRun(app, res.json().id);
      const dash = (await app.inject({ method: 'GET', url: '/eval-dashboard' })).json();
      expect(dash.agents.find((a: { agent_id: string }) => a.agent_id === agent.id)).toMatchObject({ enabled: false });
      await app.close();
    });

    it('EC-33: deleting the agent mid-run stops the run before the next case — no further LLM call, no rows left', async () => {
      const llm = new ScriptedLLM(REVIEW);
      const gate = deferred();
      llm.gate = gate.promise;
      const app = await makeApp(llm);
      const { agent } = await agentWithCases(app, 2);
      const { id } = (await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` })).json();
      while (llm.entered < 1) await sleep(10); // case 1 is inside the provider call

      const del = await app.inject({ method: 'DELETE', url: `/agents/${agent.id}` });
      expect(del.statusCode).toBe(200);
      gate.resolve();
      await sleep(300); // the detached run observes the deletion at its next checkpoint

      expect(llm.entered).toBe(1);
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toEqual([]);
      expect((await app.inject({ method: 'GET', url: `/eval-runs/${id}` })).statusCode).toBe(404);
      await app.close();
    });
  });

  describe('agent delete cascade (EC-9)', () => {
    it('EC-9: deleting an agent deletes its eval cases and runs, and only its own', async () => {
      const app = await makeApp();
      const mine = await world(app);
      const theirs = await world(app);
      const myCase = await createCase(app, mine.finding.id);
      const theirCase = await createCase(app, theirs.finding.id);
      await insertRun(mine.agent.id, { outcomes: [outcome(myCase.id, 'must_find', [11])] });
      await insertRun(mine.agent.id, { status: 'errored' });
      const theirRun = await insertRun(theirs.agent.id, { outcomes: [outcome(theirCase.id, 'must_find', [11])] });

      const del = await app.inject({ method: 'DELETE', url: `/agents/${mine.agent.id}` });
      expect(del.statusCode).toBe(200);

      expect(await db().select().from(t.evalCases).where(eq(t.evalCases.ownerId, mine.agent.id))).toEqual([]);
      expect(await db().select().from(t.evalRuns).where(eq(t.evalRuns.agentId, mine.agent.id))).toEqual([]);
      expect((await app.inject({ method: 'GET', url: `/eval-cases/${myCase.id}` })).statusCode).toBe(404);
      // the other agent is untouched
      expect((await app.inject({ method: 'GET', url: `/eval-cases/${theirCase.id}` })).statusCode).toBe(200);
      expect((await app.inject({ method: 'GET', url: `/eval-runs/${theirRun.id}` })).statusCode).toBe(200);
      await app.close();
    });
  });

  describe('boot reap (EC-14)', () => {
    it('EC-14: a run left running by a dead process is marked errored with reason "interrupted" on the next boot', async () => {
      const setup = await makeApp();
      const agent = await makeAgent(setup);
      const stale = await insertRun(agent.id, { status: 'running' });
      const done = await insertRun(agent.id, { status: 'completed', ranAt: new Date(Date.now() - 60_000) });
      await setup.close();

      const app = await makeApp(); // buildApp reaps on boot
      const reaped = (await app.inject({ method: 'GET', url: `/eval-runs/${stale.id}` })).json();
      expect(reaped).toMatchObject({ status: 'errored', error_reason: 'interrupted' });
      expect(reaped.finished_at).not.toBeNull();
      const untouched = (await app.inject({ method: 'GET', url: `/eval-runs/${done.id}` })).json();
      expect(untouched).toMatchObject({ status: 'completed', error_reason: null });

      // the single-flight slot is free again
      const overview = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-overview` })).json();
      expect(overview.running_run_id).toBeNull();
      await app.close();
    });
  });

  // =========================================================================
  // Reads: overview, dashboard, compare
  // =========================================================================

  describe('GET /agents/:id/eval-overview', () => {
    it('AC-57/AC-38/EC-36: latest/previous are the two newest FINISHED runs, trend ≤30 chronological, runs ≤50 newest first', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      await insertCaseRow(agent.id);
      await insertCaseRow(agent.id);
      const t0 = Date.UTC(2090, 0, 1);
      const rows: (typeof t.evalRuns.$inferInsert)[] = [];
      for (let i = 0; i < 50; i++) {
        rows.push(runValues(agent.id, { ranAt: new Date(t0 + i * 60_000), version: 1 + Math.floor(i / 10), metrics: metricsWith(i === 47 ? null : i / 100) }));
      }
      rows.push(runValues(agent.id, { status: 'errored', ranAt: new Date(t0 + 50 * 60_000) }));
      rows.push(runValues(agent.id, { status: 'running', ranAt: new Date(t0 + 51 * 60_000) }));
      const inserted = await db().insert(t.evalRuns).values(rows).returning();
      const running = inserted.find((r) => r.status === 'running')!;
      const finished = inserted.filter((r) => r.status === 'completed').sort((a, b) => a.ranAt.getTime() - b.ranAt.getTime());

      const res = await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-overview` });
      expect(res.statusCode).toBe(200);
      const o = res.json();
      expect(o.agent).toEqual({ id: agent.id, name: agent.name, model: 'gpt-4.1', enabled: true });
      expect(o).toMatchObject({ cases_total: 2, finished_runs: 50, running_run_id: running.id });
      expect(o.latest.id).toBe(finished[49]!.id);
      expect(o.previous.id).toBe(finished[48]!.id);
      expect(o.latest.agent_name).toBe(agent.name);

      expect(o.trend).toHaveLength(30);
      expect(o.trend.map((p: { run_id: string }) => p.run_id)).toEqual(finished.slice(20).map((r) => r.id)); // chronological
      const gap = o.trend.find((p: { run_id: string }) => p.run_id === finished[47]!.id);
      expect(gap.recall).toBeNull(); // EC-36: a gap, never 0
      expect(o.trend[0]).toMatchObject({ agent_version: finished[20]!.agentVersion, recall: 0.2 });

      expect(o.runs).toHaveLength(50);
      expect(o.runs[0].id).toBe(running.id);
      expect(o.runs[1].status).toBe('errored');
      const times = o.runs.map((r: { started_at: string }) => Date.parse(r.started_at));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      await app.close();
    });

    it('EC-23: an agent with cases but no runs → null latest/previous, empty trend and runs', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      await insertCaseRow(agent.id);
      const o = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-overview` })).json();
      expect(o).toMatchObject({ cases_total: 1, finished_runs: 0, running_run_id: null, latest: null, previous: null, trend: [], runs: [] });
      await app.close();
    });
  });

  describe('GET /eval-dashboard', () => {
    it('AC-59/AC-53/EC-24/EC-36: one summary per agent (name order) with latest run + last-10 recall sparkline; ≤20 recent runs newest first', async () => {
      const app = await makeApp();
      const withRuns = await makeAgent(app, { name: 'Dash ZZZ with runs' });
      const idle = await makeAgent(app, { name: 'Dash ZZZ idle' });
      await insertCaseRow(withRuns.id);
      await insertCaseRow(withRuns.id);
      const t0 = Date.UTC(2099, 0, 1);
      const rows = Array.from({ length: 12 }, (_, i) =>
        runValues(withRuns.id, { ranAt: new Date(t0 + i * 86_400_000), metrics: metricsWith(i === 5 ? null : (i + 1) / 20) }),
      );
      const inserted = (await db().insert(t.evalRuns).values(rows).returning()).sort((a, b) => a.ranAt.getTime() - b.ranAt.getTime());

      const res = await app.inject({ method: 'GET', url: '/eval-dashboard' });
      expect(res.statusCode).toBe(200);
      const dash = res.json();

      const names = dash.agents.map((a: { agent_name: string }) => a.agent_name);
      expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));

      const card = dash.agents.find((a: { agent_id: string }) => a.agent_id === withRuns.id);
      expect(card).toMatchObject({ agent_name: 'Dash ZZZ with runs', model: 'gpt-4.1', enabled: true, cases_total: 2 });
      expect(card.latest.id).toBe(inserted[11]!.id);
      // last 10 finished runs (indexes 2..11), chronological, with a gap at index 5
      expect(card.sparkline).toHaveLength(10);
      expect(card.sparkline[0]).toBeCloseTo(3 / 20);
      expect(card.sparkline[3]).toBeNull();
      expect(card.sparkline[9]).toBeCloseTo(12 / 20);

      const idleCard = dash.agents.find((a: { agent_id: string }) => a.agent_id === idle.id);
      expect(idleCard).toMatchObject({ cases_total: 0, latest: null, sparkline: [] });

      expect(dash.recent_runs.length).toBeLessThanOrEqual(20);
      expect(dash.recent_runs[0]).toMatchObject({ id: inserted[11]!.id, agent_name: 'Dash ZZZ with runs' });
      const times = dash.recent_runs.map((r: { started_at: string }) => Date.parse(r.started_at));
      expect([...times].sort((a, b) => b - a)).toEqual(times);
      await app.close();
    });
  });

  describe('GET /eval-runs/compare', () => {
    async function twoRuns() {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const t0 = Date.UTC(2080, 0, 1);
      // old: c1 fail, c2 pass → whole-run recall 0.5. new: c2 fail, c3 pass → whole-run recall 0.5.
      // Over the ONE common case (c2) the ratios are 1 → 0.
      const c = [randomUUID(), randomUUID(), randomUUID()];
      const oldRun = await insertRun(agent.id, {
        ranAt: new Date(t0),
        version: 1,
        outcomes: [outcome(c[0]!, 'must_find', [99]), outcome(c[1]!, 'must_find', [11])],
        snapshot: { ...BASE_SNAPSHOT, skills: [{ name: 'a', body: 'x' }] },
        costUsd: 0.1,
      });
      const newRun = await insertRun(agent.id, {
        ranAt: new Date(t0 + 3_600_000),
        version: 2,
        outcomes: [outcome(c[1]!, 'must_find', [99]), outcome(c[2]!, 'must_find', [11])],
        snapshot: {
          provider: 'openai',
          model: 'gpt-4.1-mini',
          strategy: 'map-reduce',
          system_prompt: 'line one\nline two changed',
          skills: [{ name: 'a', body: 'y' }, { name: 'b', body: 'z' }],
        },
        costUsd: 0.25,
      });
      return { app, agent, oldRun, newRun, c };
    }

    it('AC-45..AC-50/AC-60: old = the earlier run whatever the query order; ratios over common cases only; prompt, skills, model and strategy diffs', async () => {
      const { app, oldRun, newRun } = await twoRuns();
      const res = await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${newRun.id}&b=${oldRun.id}` });
      expect(res.statusCode).toBe(200);
      const cmp = res.json();

      expect(cmp.old.id).toBe(oldRun.id);
      expect(cmp.new.id).toBe(newRun.id);
      expect(cmp.old.cost_usd).toBe(0.1); // the whole run's cost
      expect(cmp.new.cost_usd).toBe(0.25);
      expect(cmp.old.metrics.recall.value).toBe(0.5); // whole-run values differ from the common ones
      expect(cmp.new.metrics.recall.value).toBe(0.5);

      expect(cmp).toMatchObject({ common_cases: 1, only_old: 1, only_new: 1 });
      expect(cmp.common.old.recall).toBe(1);
      expect(cmp.common.new.recall).toBe(0);

      expect(cmp.prompt_changed).toBe(true);
      expect(cmp.prompt_diff).toEqual([
        { kind: 'context', text: 'line one' },
        { kind: 'removed', text: 'line two' },
        { kind: 'added', text: 'line two changed' },
      ]);
      expect(cmp.skills_diff).toEqual({ added: ['b'], removed: [], changed: ['a'] });
      expect(cmp.model_change).toEqual({ from: 'gpt-4.1', to: 'gpt-4.1-mini' });
      expect(cmp.strategy_change).toEqual({ from: 'single-pass', to: 'map-reduce' });
      await app.close();
    });

    it('AC-50/EC-26: identical prompts → unchanged; no shared case → every common ratio null', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const t0 = Date.UTC(2081, 0, 1);
      const a = await insertRun(agent.id, { ranAt: new Date(t0), outcomes: [outcome(randomUUID(), 'must_find', [11])] });
      const b = await insertRun(agent.id, { ranAt: new Date(t0 + 1000), outcomes: [outcome(randomUUID(), 'must_find', [11])] });
      const cmp = (await app.inject({ method: 'GET', url: `/eval-runs/compare?a=${a.id}&b=${b.id}` })).json();
      expect(cmp.prompt_changed).toBe(false);
      expect(cmp.prompt_diff.every((l: { kind: string }) => l.kind === 'context')).toBe(true);
      expect(cmp.skills_diff).toEqual({ added: [], removed: [], changed: [] });
      expect(cmp.model_change).toBeNull();
      expect(cmp.strategy_change).toBeNull();
      expect(cmp).toMatchObject({ common_cases: 0, only_old: 1, only_new: 1 });
      expect(cmp.common.old).toEqual({ recall: null, precision: null, citation_accuracy: null });
      expect(cmp.common.new).toEqual({ recall: null, precision: null, citation_accuracy: null });
      await app.close();
    });

    it('EC-25/EC-34: different agents → 422 runs_not_comparable; a running or errored run → 422 run_not_finished with its id; unknown → 404', async () => {
      const app = await makeApp();
      const a1 = await makeAgent(app);
      const a2 = await makeAgent(app);
      const done1 = await insertRun(a1.id);
      const done1b = await insertRun(a1.id, { ranAt: new Date(Date.now() + 1000) });
      const done2 = await insertRun(a2.id);
      const running = await insertRun(a2.id, { status: 'running' });
      const errored = await insertRun(a1.id, { status: 'errored' });
      const cmp = (a: string, b: string) => app.inject({ method: 'GET', url: `/eval-runs/compare?a=${a}&b=${b}` });

      let res = await cmp(done1.id, done2.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('runs_not_comparable');

      // check order: not-comparable is reported before not-finished
      res = await cmp(done1.id, running.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('runs_not_comparable');

      res = await cmp(done2.id, running.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({ code: 'run_not_finished', details: { run_id: running.id } });

      res = await cmp(done1.id, errored.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toMatchObject({ code: 'run_not_finished', details: { run_id: errored.id } });

      expect((await cmp(done1.id, randomUUID())).statusCode).toBe(404);
      expect((await cmp(done1.id, 'not-a-uuid')).statusCode).toBe(422);
      expect((await cmp(done1.id, done1b.id)).statusCode).toBe(200);
      await app.close();
    });
  });

  // =========================================================================
  // Workspace scoping (NFR-3, EC-31)
  // =========================================================================

  describe('workspace scoping', () => {
    it('EC-31/NFR-3: every id from another workspace is 404 as if it did not exist, and nothing is changed', async () => {
      const app = await makeApp();
      const [ws2] = await db().insert(t.workspaces).values({ name: `other-${randomUUID().slice(0, 6)}` }).returning();
      const w = ws2!.id;

      const [agent2] = await db()
        .insert(t.agents)
        .values({ workspaceId: w, name: 'Foreign agent', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'p' })
        .returning();
      const { pr } = await makePr(w);
      const review = await makeReview(pr.id, agent2!.id, w);
      const finding = await makeFinding(review.id);
      const foreignCase = await insertCaseRow(agent2!.id, { workspaceId: w, sourceFindingId: finding.id });
      const foreignRun = await insertRun(agent2!.id, { ws: w });
      const foreignRun2 = await insertRun(agent2!.id, { ws: w, ranAt: new Date(Date.now() + 1000) });

      const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
        app.inject({ method, url, ...(payload ? { payload } : {}) });

      for (const [method, url, payload] of [
        ['POST', `/findings/${finding.id}/eval-case`],
        ['GET', `/pulls/${pr.id}/eval-case-links`],
        ['GET', `/agents/${agent2!.id}/eval-cases`],
        ['GET', `/agents/${agent2!.id}/eval-overview`],
        ['POST', `/agents/${agent2!.id}/eval-runs`],
        ['GET', `/eval-cases/${foreignCase.id}`],
        ['PATCH', `/eval-cases/${foreignCase.id}`, { name: 'hijacked' }],
        ['DELETE', `/eval-cases/${foreignCase.id}`],
        ['GET', `/eval-runs/${foreignRun.id}`],
        ['GET', `/eval-runs/compare?a=${foreignRun.id}&b=${foreignRun2.id}`],
      ] as const) {
        const res = await call(method, url, payload as object | undefined);
        expect(res.statusCode, `${method} ${url}`).toBe(404);
        expect(res.json().error.code).toBe('not_found');
      }

      // a mixed pair (one mine, one foreign) is 404 too
      const mine = await makeAgent(app);
      const myRun = await insertRun(mine.id);
      expect((await call('GET', `/eval-runs/compare?a=${myRun.id}&b=${foreignRun.id}`)).statusCode).toBe(404);

      // nothing was renamed or deleted, and the dashboard never lists the foreign agent
      const [row] = await db().select().from(t.evalCases).where(eq(t.evalCases.id, foreignCase.id));
      expect(row!.name).toBe(foreignCase.name);
      const dash = (await call('GET', '/eval-dashboard')).json();
      expect(dash.agents.map((a: { agent_id: string }) => a.agent_id)).not.toContain(agent2!.id);
      expect(dash.recent_runs.map((r: { id: string }) => r.id)).not.toContain(foreignRun.id);
      await app.close();
    });

    it('UI-10: a non-UUID path id is rejected with 422 validation_error before any query', async () => {
      const app = await makeApp();
      for (const url of ['/eval-cases/abc', '/eval-runs/abc', '/agents/abc/eval-cases', '/agents/abc/eval-overview', '/pulls/abc/eval-case-links']) {
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode, url).toBe(422);
        expect(res.json().error.code).toBe('validation_error');
      }
      expect((await app.inject({ method: 'POST', url: '/findings/abc/eval-case' })).statusCode).toBe(422);
      await app.close();
    });
  });

  // =========================================================================
  // NFR-1: no LLM call outside a run
  // =========================================================================

  describe('NFR-1: zero LLM calls on read and CRUD routes', () => {
    it('NFR-1: create, list, get, rename, case-links, overview, dashboard, run detail, compare and delete never reach the provider', async () => {
      const llm = new ScriptedLLM(REVIEW);
      const app = await makeApp(llm);
      const { agent, pr, finding } = await world(app);

      const c = await createCase(app, finding.id);
      const t0 = Date.now();
      const r1 = await insertRun(agent.id, { ranAt: new Date(t0), outcomes: [outcome(c.id, 'must_find', [11])] });
      const r2 = await insertRun(agent.id, { ranAt: new Date(t0 + 1000), outcomes: [outcome(c.id, 'must_find', [99])] });

      const requests: [string, string, object?][] = [
        ['GET', `/pulls/${pr.id}/eval-case-links`],
        ['GET', `/agents/${agent.id}/eval-cases`],
        ['GET', `/eval-cases/${c.id}`],
        ['PATCH', `/eval-cases/${c.id}`, { name: 'renamed' }],
        ['GET', `/agents/${agent.id}/eval-overview`],
        ['GET', '/eval-dashboard'],
        ['GET', `/eval-runs/${r1.id}`],
        ['GET', `/eval-runs/compare?a=${r1.id}&b=${r2.id}`],
        ['DELETE', `/eval-cases/${c.id}`],
      ];
      for (const [method, url, payload] of requests) {
        const res = await app.inject({ method: method as 'GET', url, ...(payload ? { payload } : {}) });
        expect(res.statusCode, `${method} ${url}`).toBeLessThan(300);
      }
      expect(llm.entered).toBe(0);
      expect(llm.calls).toEqual([]);
      await app.close();
    });
  });
});

// ---------------------------------------------------------------------------
// NFR-13 — performance on a production-sized dataset (own container: it fills
// the default workspace with 10 agents × 50 runs × 50 cases)
// ---------------------------------------------------------------------------

d('SPEC-08 eval read performance (NFR-13)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  }, 180_000);
  afterAll(async () => {
    await pg?.stop();
  });

  it('NFR-13: /eval-dashboard and /agents/:id/eval-overview answer within 500 ms with 10 agents, 50 runs and 50 cases per agent', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select({ id: t.workspaces.id }).from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    const workspaceId = ws!.id;

    const agents = await db
      .insert(t.agents)
      .values(
        Array.from({ length: 10 }, (_, i) => ({
          workspaceId,
          name: `Perf agent ${i}`,
          provider: 'openai' as const,
          model: 'gpt-4.1',
          systemPrompt: 'You are a reviewer. '.repeat(40),
        })),
      )
      .returning();

    const expectation: EvalExpectation = { type: 'must_find', file: 'src/config.ts', start_line: 10, end_line: 12 };
    for (const agent of agents) {
      const cases = await db
        .insert(t.evalCases)
        .values(
          Array.from({ length: 50 }, (_, i) => ({
            workspaceId,
            ownerKind: 'agent' as const,
            ownerId: agent.id,
            name: `perf-case-${i}`,
            inputDiff: 'diff --git a/src/config.ts b/src/config.ts\n'.repeat(1) + 'x'.repeat(2000),
            inputFiles: ['src/config.ts'],
            inputMeta: { pr_number: i, repo_full_name: 'acme/perf', title: 'T', body: null },
            expectedOutput: expectation,
          })),
        )
        .returning({ id: t.evalCases.id, name: t.evalCases.name });

      const outcomes = cases.map((c) =>
        scoreCase({
          caseId: c.id,
          name: c.name,
          expectation,
          findings: [{ file: 'src/config.ts', start_line: 11, end_line: 11, title: 'finding title', severity: 'CRITICAL', category: 'security' }],
          groundingKept: 1,
          groundingTotal: 2,
          durationMs: 10,
          costUsd: 0.001,
        }),
      );
      const metrics = scoreRun(outcomes);
      const t0 = Date.UTC(2095, 0, 1);
      await db.insert(t.evalRuns).values(
        Array.from({ length: 50 }, (_, i) => ({
          workspaceId,
          agentId: agent.id,
          status: 'completed' as const,
          agentVersion: 1 + Math.floor(i / 5),
          snapshot: { ...BASE_SNAPSHOT, system_prompt: 'You are a reviewer. '.repeat(40) },
          caseSet: cases.map((c) => ({ id: c.id, name: c.name })),
          caseResults: outcomes,
          metricParts: metrics,
          tracesPassed: metrics.traces_passed,
          tracesTotal: metrics.traces_total,
          casesErrored: 0,
          recall: metrics.recall.value,
          precision: metrics.precision.value,
          citationAccuracy: metrics.citation_accuracy.value,
          ranAt: new Date(t0 + i * 3_600_000),
          finishedAt: new Date(t0 + i * 3_600_000 + 1000),
          durationMs: 1000,
          costUsd: 0.05,
        })),
      );
    }

    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), llm: { openai: new ScriptedLLM() } },
    });

    // one warm-up request each so pool connection / planner cold-start is not measured
    await app.inject({ method: 'GET', url: '/eval-dashboard' });
    await app.inject({ method: 'GET', url: `/agents/${agents[0]!.id}/eval-overview` });

    const timed = async (url: string) => {
      const start = performance.now();
      const res = await app.inject({ method: 'GET', url });
      const ms = performance.now() - start;
      expect(res.statusCode).toBe(200);
      return { ms, body: res.json() };
    };

    const dash = await timed('/eval-dashboard');
    expect(dash.ms).toBeLessThan(500);
    const perfCards = dash.body.agents.filter((a: { agent_name: string }) => a.agent_name.startsWith('Perf agent'));
    expect(perfCards).toHaveLength(10);
    expect(perfCards.every((a: { cases_total: number; sparkline: unknown[] }) => a.cases_total === 50 && a.sparkline.length === 10)).toBe(true);
    expect(dash.body.recent_runs).toHaveLength(20);

    const overview = await timed(`/agents/${agents[0]!.id}/eval-overview`);
    expect(overview.ms).toBeLessThan(500);
    expect(overview.body).toMatchObject({ cases_total: 50, finished_runs: 50 });
    expect(overview.body.trend).toHaveLength(30);
    expect(overview.body.runs).toHaveLength(50);
    await app.close();
  }, 180_000);
});
