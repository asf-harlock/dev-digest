import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunTrace } from '@devdigest/shared';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import { runBus } from '../src/platform/sse.js';
import { PROJECT_CONTEXT_TOKEN_BUDGET } from '../src/modules/_shared/context-paths.js';
import { gitBlobId } from '../src/modules/_shared/pr-context.js';

/** MockGitClient, but with the real git blob id (AC-24 compares blob ids with the default-branch copy). */
class BlobIdGit extends MockGitClient {
  override async readFileAtCommit(...args: Parameters<MockGitClient['readFileAtCommit']>) {
    const r = await super.readFileAtCommit(...args);
    return r.ok ? { ...r, blobId: gitBlobId(r.text) } : r;
  }
}

/**
 * Hermetic — no Postgres. Drives the real ReviewRunExecutor with an in-memory
 * ReviewRepository fake, a real temp clone dir for the default-branch (SPEC-04)
 * read, MockGitClient for the head-SHA (SPEC-07) read and MockLLMProvider.
 * Covers AC-20..22, AC-24..26, AC-28, EC-3, EC-11, EC-13, UI-9, NFR-1.
 */

const HEAD = 'b'.repeat(40);
const tokenizer = { count: (t: string) => Math.ceil(t.length / 4) };
const REVIEW = { verdict: 'approve', summary: 'fine', score: 90, findings: [] };

let seq = 0;
let dir: string;

interface Harness {
  executor: ReviewRunExecutor;
  llm: MockLLMProvider;
  git: MockGitClient;
  traces: Map<string, RunTrace>;
  runIds: string[];
  run: (opts?: { contextPaths?: string[]; agentPaths?: string[]; agents?: number }) => Promise<void>;
  prompts: () => string[];
  logOf: (runId: string) => string[];
}

function harness(opts: { commitFiles?: ConstructorParameters<typeof MockGitClient>[0]; llmThrows?: boolean } = {}): Harness {
  const llm = new MockLLMProvider('openai', { structured: REVIEW });
  const git = new BlobIdGit(opts.commitFiles ?? {});
  const traces = new Map<string, RunTrace>();
  const completions: Record<string, string> = {};
  const repo = {
    getIntent: async () => undefined,
    insertReview: async (r: Record<string, unknown>) => ({ id: `rev-${seq++}`, ...r }),
    insertFindings: async () => [],
    recordRunSkills: async () => undefined,
    markReviewed: async () => undefined,
    completeAgentRun: async (id: string, p: { status: string }) => {
      completions[id] = p.status;
    },
    saveRunTrace: async (id: string, t: RunTrace) => {
      traces.set(id, t);
    },
  };
  const agentsRepo = { enabledSkillsForPrompt: async () => [] };
  const container = {
    git,
    tokenizer,
    runBus,
    llm: async () => {
      if (opts.llmThrows) throw new Error('provider key missing');
      return llm;
    },
  };
  const executor = new ReviewRunExecutor(container as never, repo as never, agentsRepo as never);
  const runIds: string[] = [];
  const h: Harness = {
    executor,
    llm,
    git,
    traces,
    runIds,
    prompts: () => llm.calls.filter((c) => c.method === 'completeStructured').map((c) => JSON.stringify(c.req)),
    logOf: (runId) => (traces.get(runId)?.log ?? []).map((l) => l.msg),
    run: async (o = {}) => {
      const pull = {
        id: 'pr-1',
        number: 7,
        repoId: 'repo-1',
        title: 'Implements SPEC-07',
        body: null,
        base: 'main',
        branch: 'feat',
        headSha: HEAD,
        contextPaths: o.contextPaths ?? [],
      };
      const jobs = Array.from({ length: o.agents ?? 1 }, (_, i) => {
        const runId = `run-${seq++}`;
        runIds.push(runId);
        return {
          runId,
          agent: {
            id: `agent-${i}`,
            name: `Agent ${i}`,
            provider: 'openai',
            model: 'gpt-4.1',
            systemPrompt: 'review',
            repoIntel: false,
            strategy: 'single-pass',
            ciFailOn: 'CRITICAL',
            version: 1,
            contextPaths: o.agentPaths ?? [],
          },
        };
      });
      await h.executor.executeRuns('ws-1', pull as never, { owner: 'o', name: 'r', clonePath: dir } as never, jobs as never);
    },
  };
  return h;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'exec-pr-ctx-'));
  await mkdir(join(dir, 'docs'));
  await mkdir(join(dir, 'specs'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const key = (p: string) => `${HEAD}:${p}`;

describe('run-executor with PR context', () => {
  it('AC-21 / AC-22 / AC-25 / AC-28: sends PR docs before project docs and persists origin "pr" entries first, specs_read and the fingerprint', async () => {
    await writeFile(join(dir, 'docs/rules.md'), '# agent rules');
    const h = harness({
      commitFiles: { commitFiles: { [key('specs/a.md')]: '# PR spec A', [key('specs/b.md')]: '# PR spec B' } },
    });
    await h.run({ contextPaths: ['specs/b.md', 'specs/a.md'], agentPaths: ['docs/rules.md'] });

    const prompt = h.prompts()[0]!;
    const pr = prompt.indexOf('## PR context');
    expect(pr).toBeGreaterThan(-1);
    expect(pr).toBeLessThan(prompt.indexOf('## Project context'));
    // saved order, one pr-context block per document
    expect(prompt.indexOf('pr-context:specs/b.md')).toBeLessThan(prompt.indexOf('pr-context:specs/a.md'));
    expect(prompt).toContain('PR spec B');

    const trace = h.traces.get(h.runIds[0]!)!;
    expect(trace.project_context!.map((e) => [e.origin, e.path, e.status])).toEqual([
      ['pr', 'specs/b.md', 'attached'],
      ['pr', 'specs/a.md', 'attached'],
      ['agent', 'docs/rules.md', 'attached'],
    ]);
    expect(trace.project_context![0]).toMatchObject({ sha: HEAD, text: '# PR spec B' });
    expect(trace.project_context![0]!.tokens).toBeGreaterThan(0);
    expect(trace.specs_read).toEqual(['specs/b.md', 'specs/a.md', 'docs/rules.md']);
    expect(trace.context_fingerprint).toEqual(expect.any(String));
  });

  it('AC-26 / UI-9 / NFR-12: logs one summary line and never the document text', async () => {
    const h = harness({
      commitFiles: { commitFiles: { [key('specs/a.md')]: '# secret-looking body text' } },
    });
    await h.run({ contextPaths: ['specs/a.md', 'specs/gone.md'] });
    const log = h.logOf(h.runIds[0]!);
    expect(log.filter((m) => m.startsWith('pr context: 1 doc(s) attached (+~'))).toHaveLength(1);
    expect(log.some((m) => m.includes('specs/gone.md') && m.includes('missing'))).toBe(true);
    expect(log.join('\n')).not.toContain('secret-looking body text');
  });

  it('AC-20: agent and skill documents get 16,000 minus the PR tokens actually sent', async () => {
    // PR doc ≈ 9,000 tokens; agent doc ≈ 8,000 tokens (fits 16,000 alone, not 7,000).
    await writeFile(join(dir, 'docs/rules.md'), 'r'.repeat(32_000));
    const withPr = harness({ commitFiles: { commitFiles: { [key('specs/big.md')]: 'p'.repeat(36_000) } } });
    await withPr.run({ contextPaths: ['specs/big.md'], agentPaths: ['docs/rules.md'] });
    const t1 = withPr.traces.get(withPr.runIds[0]!)!;
    expect(t1.project_context!.find((e) => e.origin === 'agent')!.status).toBe('over_budget');
    const prTokens = t1.project_context!.find((e) => e.origin === 'pr')!.tokens;
    expect(prTokens).toBeGreaterThan(9_000);
    expect(PROJECT_CONTEXT_TOKEN_BUDGET - prTokens).toBeLessThan(8_100);

    const without = harness();
    await without.run({ agentPaths: ['docs/rules.md'] });
    const t2 = without.traces.get(without.runIds[0]!)!;
    expect(t2.project_context!.find((e) => e.origin === 'agent')!.status).toBe('attached');
  });

  it('AC-24: a path attached to both is sent once when the PR copy equals the default-branch copy', async () => {
    await writeFile(join(dir, 'docs/shared.md'), '# same text');
    const h = harness({ commitFiles: { commitFiles: { [key('docs/shared.md')]: '# same text' } } });
    await h.run({ contextPaths: ['docs/shared.md'], agentPaths: ['docs/shared.md'] });
    const trace = h.traces.get(h.runIds[0]!)!;
    expect(trace.project_context!.map((e) => e.origin)).toEqual(['agent']);
    expect(h.prompts()[0]).not.toContain('pr-context:docs/shared.md');
    expect(h.prompts()[0]).toContain('# same text');
  });

  it('AC-20 / AC-24: tokens of a deduped PR copy go back to the agent documents', async () => {
    // PR attaches A (identical to the agent's copy, ~8,000 tokens, dropped) and B (~1,000, sent).
    // Budget must be 16,000 - B, not 16,000 - (A + B): otherwise A would be over_budget.
    const big = 'a'.repeat(32_000);
    await writeFile(join(dir, 'docs/a.md'), big);
    const h = harness({
      commitFiles: { commitFiles: { [key('docs/a.md')]: big, [key('specs/b.md')]: 'b'.repeat(4_000) } },
    });
    await h.run({ contextPaths: ['docs/a.md', 'specs/b.md'], agentPaths: ['docs/a.md'] });
    const trace = h.traces.get(h.runIds[0]!)!;
    expect(trace.project_context!.filter((e) => e.origin === 'pr').map((e) => e.path)).toEqual(['specs/b.md']);
    expect(trace.project_context!.find((e) => e.origin === 'agent')!.status).toBe('attached');
  });

  it('AC-24: the PR copy is also sent when its blob differs from the default-branch copy', async () => {
    await writeFile(join(dir, 'docs/shared.md'), '# default branch text');
    const h = harness({ commitFiles: { commitFiles: { [key('docs/shared.md')]: '# head text' } } });
    await h.run({ contextPaths: ['docs/shared.md'], agentPaths: ['docs/shared.md'] });
    const trace = h.traces.get(h.runIds[0]!)!;
    expect(trace.project_context!.map((e) => e.origin)).toEqual(['pr', 'agent']);
    expect(h.prompts()[0]).toContain('pr-context:docs/shared.md');
  });

  it('EC-11 / EC-12 / EC-21: an empty list omits the section and the fingerprint; the prompt equals the pre-feature prompt', async () => {
    await writeFile(join(dir, 'docs/rules.md'), '# agent rules');
    const h = harness();
    await h.run({ agentPaths: ['docs/rules.md'] });
    const prompt = h.prompts()[0]!;
    expect(prompt).not.toContain('PR context');
    expect(prompt).not.toContain('pr-context');
    const trace = h.traces.get(h.runIds[0]!)!;
    expect(trace.context_fingerprint ?? null).toBeNull();
    expect(trace.project_context!.every((e) => e.origin !== 'pr')).toBe(true);
    expect(h.git.ensured).toHaveLength(0);
  });

  it('EC-3 / UI-10: a head fetch failure records unreadable, logs no git text, and the run still completes', async () => {
    const h = harness({
      commitFiles: { ensureCommit: { ok: false, reason: 'fetch_failed' } },
    });
    await h.run({ contextPaths: ['specs/a.md'] });
    const trace = h.traces.get(h.runIds[0]!)!;
    expect(trace.project_context![0]).toMatchObject({ origin: 'pr', status: 'unreadable' });
    expect(h.prompts()[0]).not.toContain('PR context');
    expect(trace.log.map((l) => l.msg).join('\n')).toContain('could not be fetched');
    expect(h.git.commitReads).toHaveLength(0);
  });

  it('EC-13 / NFR-1: the list is resolved once per execution for all agents, with one fingerprint and no extra LLM call', async () => {
    const h = harness({ commitFiles: { commitFiles: { [key('specs/a.md')]: '# A' } } });
    await h.run({ contextPaths: ['specs/a.md'], agents: 2 });
    expect(h.git.ensured).toHaveLength(1);
    expect(h.git.commitReads).toHaveLength(1);
    const [t1, t2] = h.runIds.map((id) => h.traces.get(id)!);
    expect(t1!.context_fingerprint).toBe(t2!.context_fingerprint);
    // one review call per agent — PR context added none
    expect(h.llm.calls.filter((c) => c.method !== 'listModels')).toHaveLength(2);
  });

  it('AC-25 / AC-28: a run that fails still persists the PR entries and the fingerprint', async () => {
    const h = harness({
      commitFiles: { commitFiles: { [key('specs/a.md')]: '# A' } },
      llmThrows: true,
    });
    await h.run({ contextPaths: ['specs/a.md'] }); // per-agent failures are isolated
    const trace = h.traces.get(h.runIds[0]!)!;
    expect(trace.project_context![0]).toMatchObject({ origin: 'pr', path: 'specs/a.md' });
    expect(trace.context_fingerprint).toEqual(expect.any(String));
  });
});
