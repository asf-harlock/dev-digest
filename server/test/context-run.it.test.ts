import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review, StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const INVARIANTS = '# Invariants\nmodule `api/` does not import `db/` directly';
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;
const TWO_FILE_DIFF = `${DIFF}
diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,2 @@
 const a = 1;
+const b = 2;`;
const REVIEW: Review = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

class ThrowingLLM extends MockLLMProvider {
  async completeStructured<T>(_req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    throw new Error('provider exploded');
  }
}

/** Runs `onFirstCall` once, on the first LLM call, then answers normally. */
class HookedLLM extends MockLLMProvider {
  private fired = false;
  constructor(private onFirstCall: () => Promise<void>) {
    super('openai', { structured: REVIEW });
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (!this.fired) {
      this.fired = true;
      await this.onFirstCall();
    }
    return super.completeStructured(req);
  }
}

type TestApp = Awaited<ReturnType<typeof buildApp>>;

/** SPEC-04 — what a real review run sends to the model and persists in its trace. */
d('SPEC-04 project context in a review run (AC-33, EC-14, EC-18)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;
  let cloneDir: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    base = await mkdtemp(join(tmpdir(), 'devdigest-ctx-run-'));
    cloneDir = join(base, 'clone');
    await mkdir(join(cloneDir, 'docs'), { recursive: true });
    await writeFile(join(cloneDir, 'docs/architecture-invariants.md'), INVARIANTS);
  });
  afterAll(async () => {
    await pg?.stop();
    if (base) await rm(base, { recursive: true, force: true });
  });

  const appWith = (llm: MockLLMProvider, diff = DIFF) =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ diff, head: 'headsha1' }), llm: { openai: llm } },
    });

  async function setup(files = 1) {
    const name = `ctx-run-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath: cloneDir })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'PR',
        author: 'a',
        branch: 'f',
        base: 'main',
        headSha: 'a1b2',
        additions: 1,
        deletions: 0,
        filesCount: files,
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    return pr!;
  }
  async function agentWith(app: TestApp, paths: string[], strategy?: string) {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: `Ctx Run Agent ${seq++}`,
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'rev',
          ...(strategy ? { strategy } : {}),
        },
      })
    ).json();
    if (paths.length) {
      const res = await app.inject({ method: 'PUT', url: `/agents/${agent.id}/context`, payload: { paths } });
      expect(res.statusCode).toBe(200);
    }
    return agent as { id: string };
  }
  async function review(app: TestApp, prId: string, agentId: string) {
    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id as string;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    return runId;
  }
  async function storedTrace(runId: string) {
    const [row] = await pg.handle.db.select().from(t.runTraces).where(eq(t.runTraces.runId, runId));
    return row!.trace as {
      specs_read: string[];
      project_context?: { path: string; status: string; text: string; sha: string; origin: string; tokens: number }[];
      prompt_assembly: { system: string; specs: string | null; user: string };
      log: { msg: string }[];
    };
  }
  const structuredCalls = (llm: MockLLMProvider) => llm.calls.filter((c) => c.method === 'completeStructured');

  it('AC-33: an agent with docs/architecture-invariants.md gets a labelled block in the prompt and the trace', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await appWith(llm);
    const pr = await setup();
    const agent = await agentWith(app, ['docs/architecture-invariants.md']);
    const runId = await review(app, pr.id, agent.id);

    const messages = (structuredCalls(llm)[0]!.req as { messages: { role: string; content: string }[] }).messages;
    const all = messages.map((m) => m.content).join('\n');
    expect(all).toContain('## Project context');
    expect(all).toContain('<untrusted source="project-context:docs/architecture-invariants.md">');
    expect(all).toContain(INVARIANTS);
    expect(messages[0]!.content).toContain('`project-context:`'); // AC-25 guard sentence present

    const trace = await storedTrace(runId);
    expect(trace.specs_read).toEqual(['docs/architecture-invariants.md']);
    expect(trace.project_context).toHaveLength(1);
    expect(trace.project_context![0]).toMatchObject({
      path: 'docs/architecture-invariants.md',
      status: 'attached',
      text: INVARIANTS,
      sha: 'headsha1',
      origin: 'agent',
    });
    expect(trace.prompt_assembly.specs).toContain('project-context:docs/architecture-invariants.md');
    expect(trace.log.some((l) => /project context: 1 doc\(s\) attached/.test(l.msg))).toBe(true);
    await app.close();
  });

  it('EC-14: an agent with no docs gets no "## Project context" section, no guard sentence, no project_context in the trace', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await appWith(llm);
    const pr = await setup();
    const agent = await agentWith(app, []);
    const runId = await review(app, pr.id, agent.id);

    const all = JSON.stringify(structuredCalls(llm)[0]!.req);
    expect(all).not.toContain('## Project context');
    expect(all).not.toContain('project-context:');
    const trace = await storedTrace(runId);
    expect(trace.project_context).toBeUndefined();
    expect(trace.specs_read).toEqual([]);
    expect(trace.log.some((l) => l.msg.startsWith('project context:'))).toBe(false);
    await app.close();
  });

  it('EC-8: a doc deleted after attaching is recorded as missing, is not sent, and the run still succeeds', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await appWith(llm);
    const pr = await setup();
    await writeFile(join(cloneDir, 'docs/temp.md'), 'temporary');
    const agent = await agentWith(app, ['docs/temp.md', 'docs/architecture-invariants.md']);
    await rm(join(cloneDir, 'docs/temp.md'));
    const runId = await review(app, pr.id, agent.id);

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('done');
    const trace = await storedTrace(runId);
    expect(trace.project_context!.map((e) => [e.path, e.status])).toEqual([
      ['docs/temp.md', 'missing'],
      ['docs/architecture-invariants.md', 'attached'],
    ]);
    expect(trace.specs_read).toEqual(['docs/architecture-invariants.md']);
    expect(JSON.stringify(llm.calls)).not.toContain('temporary');
    await app.close();
  });

  it('EC-16: with map-reduce every per-file call carries the doc', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await appWith(llm, TWO_FILE_DIFF);
    const pr = await setup(2);
    const agent = await agentWith(app, ['docs/architecture-invariants.md'], 'map-reduce');
    await review(app, pr.id, agent.id);
    const calls = structuredCalls(llm);
    expect(calls.length).toBe(2);
    for (const c of calls) {
      expect(JSON.stringify(c.req)).toContain('project-context:docs/architecture-invariants.md');
    }
    await app.close();
  });

  it('EC-18: when the run FAILS, project_context and specs_read are still persisted in the trace', async () => {
    const app = await appWith(new ThrowingLLM('openai', {}));
    const pr = await setup();
    const agent = await agentWith(app, ['docs/architecture-invariants.md']);
    const runId = await review(app, pr.id, agent.id);

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('failed');
    const trace = await storedTrace(runId);
    expect(trace.specs_read).toEqual(['docs/architecture-invariants.md']);
    expect(trace.project_context).toHaveLength(1);
    expect(trace.project_context![0]).toMatchObject({ status: 'attached', text: INVARIANTS });
    await app.close();
  });

  it('EC-18: when the run is CANCELLED mid-flight, project_context and specs_read are still persisted', async () => {
    const holder: { app?: TestApp } = {};
    const llm = new HookedLLM(async () => {
      const [running] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.status, 'running'));
      // Flag the run directly on the bus (what POST /runs/:id/cancel does first).
      // The route itself is not used: it calls runBus.complete() right after,
      // which clears the flag before the next checkpoint (pre-existing, see report).
      holder.app!.container.runBus.cancel(running!.id);
    });
    const app = await appWith(llm, TWO_FILE_DIFF);
    holder.app = app;
    const pr = await setup(2);
    const agent = await agentWith(app, ['docs/architecture-invariants.md'], 'map-reduce');
    const runId = await review(app, pr.id, agent.id);

    const [run] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
    expect(run!.status).toBe('cancelled');
    const trace = await storedTrace(runId);
    expect(trace.specs_read).toEqual(['docs/architecture-invariants.md']);
    expect(trace.project_context![0]).toMatchObject({ status: 'attached', text: INVARIANTS });
    await app.close();
  });
});
