import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type {
  CommitFilesPayload,
  CommitFilesResult,
  ListWorkflowRunsOptions,
  OpenPrPayload,
  RepoRef,
  RunArtifact,
  WorkflowRun,
} from '@devdigest/shared';
import { MockGitHubClient } from '../../adapters/mocks.js';
import { AppError } from '../../platform/errors.js';
import type { Container } from '../../platform/container.js';
import { CiService } from './service.js';
import {
  CI_BRANCH,
  MEMORY_PATH,
  PR_TITLE,
  REFRESH_CONCURRENCY,
  WORKFLOW_PATH,
  WORKFLOW_VERSION,
} from './constants.js';
import type {
  AgentRow,
  CiInstallationRow,
  CiInstallationWithAgent,
  CiMemoryRow,
  CiRepoRow,
  CiRepository,
  CiRunRow,
  CiSkillRow,
  InsertAgentRunInput,
  UpsertInstallationInput,
  UpsertInstallationResult,
  UpsertRunInput,
} from './repository.js';

/**
 * SPEC-12 — `CiService`, hermetic. The persistence port is an in-memory fake that
 * mirrors the repository's contract (workspace scoping, one installation per
 * repository, `running` rows replaced once, a completed run stored once); the real
 * SQL is covered by `test/ci*.it.test.ts`. GitHub is a spy on top of
 * `MockGitHubClient`, the container a plain object: no DB, no network, no LLM.
 */

const WS = 'ws-1';
const OTHER_WS = 'ws-2';
const REPO = 'acme/payments-api';
const SHA = 'a'.repeat(40);
const T0 = new Date('2026-06-01T12:00:00.000Z');
/** Fake credentials — shaped like the real ones so the scrubber's patterns apply. */
const GH_TOKEN = `ghp_${'A1b2C3d4E5'.repeat(4)}`;
const OR_KEY = `sk-or-v1-${'z9y8x7w6v5'.repeat(3)}`;

// ------------------------------------------------------------------ in-memory repo

type RepoFixture = CiRepoRow & { workspaceId: string };

class FakeCiRepo {
  agents: AgentRow[] = [];
  repos: RepoFixture[] = [];
  skills: CiSkillRow[] = [];
  memory: CiMemoryRow[] = [];
  installations: CiInstallationRow[] = [];
  runs: CiRunRow[] = [];
  agentRuns: Array<InsertAgentRunInput & { id: string }> = [];
  staleCutoffs: Date[] = [];
  /** Forces the next `upsertInstallation` result (a lost insert race). */
  forcedUpsert: UpsertInstallationResult | undefined;
  private seq = 0;

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }

  async getAgent(ws: string, id: string) {
    return this.agents.find((a) => a.workspaceId === ws && a.id === id);
  }

  async findRepoByFullName(ws: string, fullName: string) {
    return this.repos.find((r) => r.workspaceId === ws && r.fullName.toLowerCase() === fullName.toLowerCase());
  }

  async enabledSkillsInLinkOrder(_ws: string, _agentId: string) {
    return this.skills;
  }

  async repoMemoryRows(_ws: string, _repoId: string, limit: number) {
    return this.memory.slice(0, limit);
  }

  async countRepoMemory(_ws: string, _repoId: string) {
    return this.memory.length;
  }

  private join(rows: CiInstallationRow[]): CiInstallationWithAgent[] {
    return rows.flatMap((installation) => {
      const agent = this.agents.find((a) => a.id === installation.agentId);
      return agent ? [{ installation, agentName: agent.name, agentVersion: agent.version }] : [];
    });
  }

  async listInstallationsByAgent(ws: string, agentId: string) {
    return this.join(this.installations.filter((i) => i.workspaceId === ws && i.agentId === agentId));
  }

  async listInstallations(ws: string) {
    return this.join(this.installations.filter((i) => i.workspaceId === ws));
  }

  async getInstallation(ws: string, id: string) {
    return this.join(this.installations.filter((i) => i.workspaceId === ws && i.id === id))[0];
  }

  async findInstallationByRepo(ws: string, repo: string) {
    return this.join(
      this.installations.filter((i) => i.workspaceId === ws && i.repo.toLowerCase() === repo.toLowerCase()),
    )[0];
  }

  async upsertInstallation(input: UpsertInstallationInput): Promise<UpsertInstallationResult> {
    if (this.forcedUpsert) return this.forcedUpsert;
    const existing = await this.findInstallationByRepo(input.workspaceId, input.repo);
    if (existing) {
      if (existing.installation.agentId !== input.agentId) {
        return { kind: 'repo_taken', installation: existing.installation, agentName: existing.agentName };
      }
      Object.assign(existing.installation, {
        status: existing.installation.status === 'active' ? 'active' : input.status,
        prUrl: input.prUrl,
        workflowVersion: input.workflowVersion,
        agentVersion: input.agentVersion,
        postAs: input.postAs,
        triggers: input.triggers,
        ciFailOn: input.ciFailOn,
      });
      return { kind: 'saved', installation: existing.installation };
    }
    const row = {
      id: this.id('inst'),
      ...input,
      installedAt: T0,
      lastRefreshedAt: null,
    } as unknown as CiInstallationRow;
    this.installations.push(row);
    return { kind: 'saved', installation: row };
  }

  async touchLastRefreshed(ws: string, id: string, at: Date) {
    const row = this.installations.find((i) => i.workspaceId === ws && i.id === id);
    if (row) row.lastRefreshedAt = at;
  }

  async markActiveOnFirstRun(ws: string, id: string) {
    const row = this.installations.find((i) => i.workspaceId === ws && i.id === id);
    if (row && row.status !== 'active') row.status = 'active';
  }

  async findRunByGithubId(ws: string, githubRunId: number, runAttempt: number) {
    return this.runs.find(
      (r) => r.workspaceId === ws && r.githubRunId === githubRunId && r.runAttempt === runAttempt,
    );
  }

  private upsertRun(input: UpsertRunInput): CiRunRow | undefined {
    const existing = this.runs.find(
      (r) =>
        r.workspaceId === input.workspaceId &&
        r.githubRunId === input.githubRunId &&
        r.runAttempt === input.runAttempt,
    );
    if (existing) {
      if (existing.status !== 'running') return undefined;
      Object.assign(existing, input);
      return existing;
    }
    const row = { id: this.id('run'), ...input, source: 'github_actions', agentRunId: null, ingestedAt: T0 } as unknown as CiRunRow;
    this.runs.push(row);
    return row;
  }

  async upsertRunning(input: UpsertRunInput) {
    return this.upsertRun(input);
  }

  async saveCompletedRunWithAgentRun(run: UpsertRunInput, agentRun: Omit<InsertAgentRunInput, 'ciRunId'>) {
    const saved = this.upsertRun(run);
    if (!saved) return undefined;
    const id = this.id('agent-run');
    this.agentRuns.push({ ...agentRun, ciRunId: saved.id, id });
    saved.agentRunId = id;
    return saved;
  }

  async failStaleRunning(ws: string, olderThan: Date) {
    this.staleCutoffs.push(olderThan);
    let n = 0;
    for (const r of this.runs) {
      const at = r.ranAt ?? r.ingestedAt;
      if (r.workspaceId === ws && r.status === 'running' && at < olderThan) {
        r.status = 'failed';
        r.failureReason = 'stale';
        n += 1;
      }
    }
    return n;
  }

  async listRuns(ws: string, filter: { limit?: number } = {}) {
    return this.runs.filter((r) => r.workspaceId === ws).slice(0, filter.limit ?? 200);
  }

  async lastRunPerInstallation(ws: string, ids: string[]) {
    return ids.flatMap((id) => {
      const run = this.runs.find((r) => r.workspaceId === ws && r.ciInstallationId === id);
      return run ? [{ installationId: id, status: run.status, ranAt: run.ranAt }] : [];
    });
  }
}

// ------------------------------------------------------------------ GitHub spy

type Method =
  | 'commitFiles'
  | 'findOpenPr'
  | 'openPullRequest'
  | 'listWorkflowRuns'
  | 'listRunArtifacts'
  | 'downloadArtifact';

/**
 * `MockGitHubClient` + a call log, injectable failures/gates, and the real adapter's
 * `commitFiles` semantics: the parent is the branch when it exists (the base when it
 * does not); an identical tree makes no commit and reports `changed` = "the branch still
 * differs from the base".
 */
class SpyGitHub extends MockGitHubClient {
  calls: Method[] = [];
  commits: CommitFilesPayload[] = [];
  prs: OpenPrPayload[] = [];
  listOpts: ListWorkflowRunsOptions[] = [];
  runs: WorkflowRun[] = [];
  artifactList: Record<number, RunArtifact[]> = {};
  zips: Record<number, Uint8Array> = {};
  openPr: { url: string } | null = null;
  fail: Partial<Record<Method, unknown>> = {};
  gate: Partial<Record<Method, Promise<void>>> = {};
  onList: (() => void) | undefined;
  inFlight = 0;
  maxInFlight = 0;
  private trees = new Map<string, string>();
  /** Tree the default branch holds (as JSON of the files); undefined = none of the exported files. */
  baseTree: string | undefined;

  private async enter(method: Method): Promise<void> {
    this.calls.push(method);
    const gate = this.gate[method];
    if (gate) await gate;
    if (this.fail[method] !== undefined) throw this.fail[method];
  }

  count(method: Method): number {
    return this.calls.filter((c) => c === method).length;
  }

  override async commitFiles(_repo: RepoRef, payload: CommitFilesPayload): Promise<CommitFilesResult> {
    await this.enter('commitFiles');
    const tree = JSON.stringify(payload.files);
    const baseTree = this.baseTree ?? `base:${payload.base}`;
    const branchTree = this.trees.get(payload.branch);
    if (tree === (branchTree ?? baseTree)) {
      // Branch absent: the base already holds the files. Branch present: no commit, but
      // `changed` says whether it still differs from the base (the adapter's EC-9 rule).
      return { branch: payload.branch, changed: branchTree !== undefined && branchTree !== baseTree };
    }
    this.trees.set(payload.branch, tree);
    this.commits.push(payload);
    return { branch: payload.branch, changed: true };
  }

  override async findOpenPr(): Promise<{ url: string } | null> {
    await this.enter('findOpenPr');
    return this.openPr;
  }

  override async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    await this.enter('openPullRequest');
    this.prs.push(payload);
    this.openPr = { url: `https://github.com/${repo.owner}/${repo.name}/pull/9` };
    return this.openPr;
  }

  override async listWorkflowRuns(_repo: RepoRef, opts: ListWorkflowRunsOptions): Promise<WorkflowRun[]> {
    await this.enter('listWorkflowRuns');
    this.listOpts.push(opts);
    this.onList?.();
    return this.runs;
  }

  override async listRunArtifacts(_repo: RepoRef, runId: number): Promise<RunArtifact[]> {
    await this.enter('listRunArtifacts');
    return this.artifactList[runId] ?? [];
  }

  override async downloadArtifact(_repo: RepoRef, artifactId: number): Promise<Uint8Array> {
    await this.enter('downloadArtifact');
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await new Promise((r) => setTimeout(r, 1));
    this.inFlight -= 1;
    const bytes = this.zips[artifactId];
    if (!bytes) throw new AppError('artifact_expired', 'The artifact has expired', 410);
    return bytes;
  }
}

// ------------------------------------------------------------------ fixtures

interface World {
  svc: CiService;
  repo: FakeCiRepo;
  gh: SpyGitHub;
  llm: ReturnType<typeof vi.fn>;
  secrets: Record<string, string | undefined>;
  config: { agentRunnerDist: string };
}

function agentRow(over: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'agent-1',
    workspaceId: WS,
    name: 'Security Reviewer',
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet',
    systemPrompt: 'Review the diff for security issues.',
    strategy: 'auto',
    ciFailOn: 'critical',
    version: 3,
    ...over,
  } as AgentRow;
}

function installationRow(over: Partial<CiInstallationRow> = {}): CiInstallationRow {
  return {
    id: 'inst-0',
    workspaceId: WS,
    agentId: 'agent-1',
    repo: REPO,
    targetType: 'gha',
    status: 'pending_pr',
    prUrl: `https://github.com/${REPO}/pull/9`,
    workflowVersion: WORKFLOW_VERSION,
    agentVersion: 3,
    postAs: 'github_review',
    triggers: ['opened', 'synchronize'],
    ciFailOn: 'critical',
    manifestSlug: 'security-reviewer',
    installedAt: T0,
    lastRefreshedAt: null,
    ...over,
  } as CiInstallationRow;
}

let dist: string;
let emptyDist: string;

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), 'ci-service-dist-'));
  writeFileSync(join(dist, 'index.js'), 'console.log("runner");\n');
  writeFileSync(join(dist, 'package.json'), '{"type":"module"}\n');
  emptyDist = mkdtempSync(join(tmpdir(), 'ci-service-empty-'));
});

afterAll(() => {
  rmSync(dist, { recursive: true, force: true });
  rmSync(emptyDist, { recursive: true, force: true });
});

function world(over: { token?: string | undefined; dist?: string } = {}): World {
  const repo = new FakeCiRepo();
  repo.agents.push(agentRow(), agentRow({ id: 'agent-2', name: 'Perf Reviewer', version: 1 }));
  repo.repos.push({ id: 'repo-1', workspaceId: WS, owner: 'acme', name: 'payments-api', fullName: REPO, defaultBranch: 'trunk' });
  repo.skills.push({ id: 's1', name: 'OWASP', body: '# owasp\n', version: 1 });
  repo.memory.push({ id: 'm1', kind: 'fact', content: 'Uses pnpm', confidence: 0.9, createdAt: T0 });
  const gh = new SpyGitHub();
  const llm = vi.fn();
  const secrets: Record<string, string | undefined> = {
    GITHUB_TOKEN: 'token' in over ? over.token : GH_TOKEN,
    OPENROUTER_API_KEY: OR_KEY,
  };
  const config = { agentRunnerDist: over.dist ?? dist };
  const container = {
    config,
    db: {},
    secrets: { get: async (k: string) => secrets[k] },
    github: async () => gh,
    llm,
  } as unknown as Container;
  const svc = new CiService(container, repo as unknown as CiRepository);
  return { svc, repo, gh, llm, secrets, config };
}

const input = (over: Record<string, unknown> = {}) =>
  ({
    repo: REPO,
    target: 'gha',
    action: 'open_pr',
    post_as: 'github_review',
    triggers: ['opened', 'synchronize'],
    ...over,
  }) as Parameters<CiService['exportToPr']>[2];

async function caught(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    return err as AppError;
  }
  throw new Error('expected the call to reject');
}

function workflowRun(id: number, over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    head_sha: SHA,
    event: 'pull_request',
    path: WORKFLOW_PATH,
    head_repository_full_name: REPO,
    html_url: `https://github.com/${REPO}/actions/runs/${id}`,
    // recent on purpose: a run started more than 24 h ago that is still running is stale (EC-28)
    created_at: new Date(Date.now() - 120_000).toISOString(),
    run_started_at: new Date(Date.now() - 115_000).toISOString(),
    updated_at: new Date(Date.now() - 60_000).toISOString(),
    pull_requests: [7],
    ...over,
  };
}

const artifactId = (runId: number) => runId + 1000;

function resultZip(over: { result?: object; meta?: object } = {}): Uint8Array {
  const result = {
    findings_count: 3,
    critical: 1,
    warning: 1,
    suggestion: 1,
    cost_usd: 0.02,
    duration_ms: 1234,
    agent: 'Forged Name',
    version: '1',
    pr_number: 7,
    ...over.result,
  };
  const meta = { commit_sha: SHA, repository: REPO, pr_number: 7, ...over.meta };
  return zipSync({
    'devdigest-result.json': strToU8(JSON.stringify(result)),
    'devdigest-run.json': strToU8(JSON.stringify(meta)),
  });
}

/** Register a completed run with a verifiable artifact on the spy. */
function addRun(w: World, id: number, over: Partial<WorkflowRun> = {}, zip: Uint8Array | null = resultZip()): void {
  w.gh.runs.push(workflowRun(id, over));
  w.gh.artifactList[id] = [{ id: artifactId(id), name: 'devdigest-result', size_in_bytes: 100, expired: false }];
  if (zip) w.gh.zips[artifactId(id)] = zip;
}

function withInstallation(w: World, over: Partial<CiInstallationRow> = {}): CiInstallationRow {
  const row = installationRow(over);
  w.repo.installations.push(row);
  return row;
}

const refreshOne = (w: World, installationId: string, force = true) =>
  w.svc.refresh(WS, { installation_id: installationId, force });

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Export — pull request path
// =============================================================================

describe('CiService.exportToPr', () => {
  it('AC-12: commits every file in ONE commit to devdigest/ci, created from the default branch', async () => {
    const w = world();
    await w.svc.exportToPr(WS, 'agent-1', input());

    expect(w.gh.commits).toHaveLength(1);
    const commit = w.gh.commits[0]!;
    expect(commit.branch).toBe(CI_BRANCH);
    expect(commit.base).toBe('trunk');
    const paths = commit.files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '.devdigest/agents/security-reviewer.yaml',
        '.devdigest/skills/owasp.md',
        MEMORY_PATH,
        WORKFLOW_PATH,
        '.devdigest/runner/index.js',
        '.devdigest/runner/package.json',
      ]),
    );
  });

  it('AC-13: opens "Add DevDigest CI review" from devdigest/ci against the default branch', async () => {
    const w = world();
    const { body } = await w.svc.exportToPr(WS, 'agent-1', input());

    expect(w.gh.prs).toHaveLength(1);
    expect(w.gh.prs[0]).toMatchObject({ title: PR_TITLE, head: CI_BRANCH, base: 'trunk' });
    expect(body.pr_url).toBe(`https://github.com/${REPO}/pull/9`);
  });

  it('AC-17: nothing is ever written to the default branch', async () => {
    const w = world();
    await w.svc.exportToPr(WS, 'agent-1', input());
    await w.svc.exportToPr(WS, 'agent-1', input({ triggers: ['opened'] })); // an Update

    expect(w.gh.commits.length).toBeGreaterThan(0);
    for (const c of w.gh.commits) {
      expect(c.branch).toBe(CI_BRANCH);
      expect(c.branch).not.toBe('trunk');
    }
    for (const pr of w.gh.prs) expect(pr.head).not.toBe(pr.base);
  });

  it('AC-15: stores the installation pending_pr with the PR URL and the export settings', async () => {
    const w = world();
    const { created, body } = await w.svc.exportToPr(WS, 'agent-1', input({ post_as: 'pr_comment', triggers: ['reopened', 'opened'] }));

    expect(created).toBe(true);
    expect(w.repo.installations).toHaveLength(1);
    expect(w.repo.installations[0]).toMatchObject({
      workspaceId: WS,
      agentId: 'agent-1',
      repo: REPO,
      targetType: 'gha',
      status: 'pending_pr',
      prUrl: `https://github.com/${REPO}/pull/9`,
      workflowVersion: WORKFLOW_VERSION,
      agentVersion: 3,
      postAs: 'pr_comment',
      triggers: ['opened', 'reopened'],
      ciFailOn: 'critical',
      manifestSlug: 'security-reviewer',
    });
    expect(body.installation).toMatchObject({ status: 'pending_pr', agent_name: 'Security Reviewer', repo: REPO });
    expect(body.file_count).toBe(w.gh.commits[0]!.files.length);
  });

  it('AC-16: reuses the open PR of devdigest/ci — commits again, opens no second PR', async () => {
    const w = world();
    w.gh.openPr = { url: `https://github.com/${REPO}/pull/4` };

    const { body } = await w.svc.exportToPr(WS, 'agent-1', input());

    expect(w.gh.commits).toHaveLength(1);
    expect(w.gh.prs).toHaveLength(0);
    expect(body.pr_url).toBe(`https://github.com/${REPO}/pull/4`);
  });

  it('AC-16: an unchanged tree with an open PR is not an error — the PR URL is returned', async () => {
    const w = world();
    await w.svc.exportToPr(WS, 'agent-1', input());
    const again = await w.svc.exportToPr(WS, 'agent-1', input());

    expect(again.created).toBe(false);
    expect(again.body.pr_url).toBe(`https://github.com/${REPO}/pull/9`);
    expect(w.gh.prs).toHaveLength(1);
  });

  it('AC-34: a re-export by the same agent updates the installation and keeps the first manifest slug', async () => {
    const w = world();
    await w.svc.exportToPr(WS, 'agent-1', input());
    w.repo.agents[0]!.name = 'Renamed Reviewer';
    w.repo.agents[0]!.version = 4;
    const second = await w.svc.exportToPr(WS, 'agent-1', input({ post_as: 'none' }));

    expect(second.created).toBe(false);
    expect(w.repo.installations).toHaveLength(1);
    expect(w.repo.installations[0]).toMatchObject({ postAs: 'none', agentVersion: 4, manifestSlug: 'security-reviewer' });
    const manifests = w.gh.commits[1]!.files.filter((f) => f.path.startsWith('.devdigest/agents/'));
    expect(manifests.map((f) => f.path)).toEqual(['.devdigest/agents/security-reviewer.yaml']);
  });

  it('AC-34: an Update never demotes an installation that is already active', async () => {
    const w = world();
    withInstallation(w, { status: 'active' });
    await w.svc.exportToPr(WS, 'agent-1', input());

    expect(w.repo.installations[0]!.status).toBe('active');
  });

  it('AC-33: a repository owned by another agent → 409 ci_repo_taken with details, nothing changes', async () => {
    const w = world();
    withInstallation(w, { agentId: 'agent-2', status: 'active' });
    const before = JSON.stringify(w.repo.installations);

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input()));

    expect(err.code).toBe('ci_repo_taken');
    expect(err.statusCode).toBe(409);
    expect(err.details).toEqual({ agent_id: 'agent-2', agent_name: 'Perf Reviewer', installation_id: 'inst-0' });
    expect(w.gh.calls).toEqual([]); // no commit, no PR
    expect(JSON.stringify(w.repo.installations)).toBe(before);
  });

  it('AC-33: the same refusal applies to the zip path', async () => {
    const w = world();
    withInstallation(w, { agentId: 'agent-2' });

    const err = await caught(w.svc.exportArchive(WS, 'agent-1', input({ action: 'files' })));

    expect(err.code).toBe('ci_repo_taken');
    expect(w.repo.installations).toHaveLength(1);
  });

  it('NFR-2: losing the insert race (upsert answers repo_taken after the pre-check) is ci_repo_taken, not a 500', async () => {
    const w = world();
    const winner = installationRow({ id: 'inst-w', agentId: 'agent-2' });
    w.repo.forcedUpsert = { kind: 'repo_taken', installation: winner, agentName: 'Perf Reviewer' };

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input()));

    expect(err.code).toBe('ci_repo_taken');
    expect(err.details).toEqual({ agent_id: 'agent-2', agent_name: 'Perf Reviewer', installation_id: 'inst-w' });
  });

  it('EC-8: a second export of the same repository while one runs → 409 ci_export_running (case-insensitive)', async () => {
    const w = world();
    let release!: () => void;
    w.gh.gate.commitFiles = new Promise<void>((r) => (release = r));

    const first = w.svc.exportToPr(WS, 'agent-1', input());
    await vi.waitFor(() => expect(w.gh.count('commitFiles')).toBe(1));

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input({ repo: 'ACME/Payments-API' })));
    expect(err.code).toBe('ci_export_running');
    expect(err.statusCode).toBe(409);

    release();
    await expect(first).resolves.toMatchObject({ created: true });
    // the lock is released: a later export is accepted again
    await expect(w.svc.exportToPr(WS, 'agent-1', input())).resolves.toBeDefined();
  });

  it('EC-8: the lock is per workspace — another workspace is not blocked', async () => {
    const w = world();
    w.repo.agents.push(agentRow({ id: 'agent-9', workspaceId: OTHER_WS }));
    w.repo.repos.push({ id: 'repo-9', workspaceId: OTHER_WS, owner: 'acme', name: 'payments-api', fullName: REPO, defaultBranch: 'main' });
    let release!: () => void;
    w.gh.gate.commitFiles = new Promise<void>((r) => (release = r));

    const first = w.svc.exportToPr(WS, 'agent-1', input());
    await vi.waitFor(() => expect(w.gh.count('commitFiles')).toBe(1));
    const other = w.svc.exportToPr(OTHER_WS, 'agent-9', input({ post_as: 'none' }));
    await vi.waitFor(() => expect(w.gh.count('commitFiles')).toBe(2));

    release();
    await expect(Promise.all([first, other])).resolves.toHaveLength(2);
  });

  it('EC-1: no stored GitHub token → 409 github_token_missing, no GitHub call, nothing stored', async () => {
    const w = world({ token: undefined });

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input()));

    expect(err.code).toBe('github_token_missing');
    expect(err.statusCode).toBe(409);
    expect(w.gh.calls).toEqual([]);
    expect(w.repo.installations).toEqual([]);
  });

  it('EC-2: GitHub rejecting the commit (403/404) surfaces as github_permission and stores nothing', async () => {
    const w = world();
    w.gh.fail.commitFiles = new AppError('github_permission', 'GitHub rejected the request', 403, { operation: 'commit_files' });

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input()));

    expect(err.code).toBe('github_permission');
    expect(w.gh.prs).toEqual([]);
    expect(w.repo.installations).toEqual([]);
  });

  it('EC-3: a missing or empty runner dist → 409 runner_bundle_missing for preview and export, no GitHub call', async () => {
    const w = world({ dist: emptyDist });

    const preview = await caught(w.svc.preview(WS, 'agent-1', input()));
    const exported = await caught(w.svc.exportToPr(WS, 'agent-1', input()));
    const zip = await caught(w.svc.exportArchive(WS, 'agent-1', input({ action: 'files' })));

    for (const err of [preview, exported, zip]) {
      expect(err.code).toBe('runner_bundle_missing');
      expect(err.statusCode).toBe(409);
      expect(err.message).toContain('pnpm --dir agent-runner build');
    }
    expect(w.gh.calls).toEqual([]);
    expect(w.repo.installations).toEqual([]);
  });

  it('EC-4: a target other than gha → 422 unsupported_target (preview, export, zip, file)', async () => {
    const w = world();
    const bad = input({ target: 'jenkins' });

    const errors = await Promise.all([
      caught(w.svc.preview(WS, 'agent-1', bad)),
      caught(w.svc.exportToPr(WS, 'agent-1', bad)),
      caught(w.svc.exportArchive(WS, 'agent-1', bad)),
      caught(w.svc.previewFile(WS, 'agent-1', { ...bad, path: WORKFLOW_PATH })),
    ]);

    for (const err of errors) {
      expect(err.code).toBe('unsupported_target');
      expect(err.statusCode).toBe(422);
    }
    expect(w.gh.calls).toEqual([]);
  });

  it('EC-5: a manifest that does not validate → 422, nothing is committed or stored', async () => {
    const w = world();
    w.repo.agents[0]!.model = ''; // AgentManifest requires a non-empty model

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input()));

    expect(err.statusCode).toBe(422);
    expect(w.gh.calls).toEqual([]);
    expect(w.repo.installations).toEqual([]);
  });

  it('EC-9: a PR that fails after the commit → 502 ci_pr_failed with the branch, no installation stored', async () => {
    const w = world();
    w.gh.fail.openPullRequest = new Error('GitHub is down');

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input()));

    expect(err.code).toBe('ci_pr_failed');
    expect(err.statusCode).toBe(502);
    expect(err.details).toEqual({ branch: CI_BRANCH });
    expect(w.gh.commits).toHaveLength(1);
    expect(w.repo.installations).toEqual([]);
  });

  it('EC-9: the retry after a failed PR reuses the same branch and opens the PR', async () => {
    const w = world();
    w.gh.fail.openPullRequest = new Error('GitHub is down');
    await caught(w.svc.exportToPr(WS, 'agent-1', input()));
    delete w.gh.fail.openPullRequest;

    const retry = await w.svc.exportToPr(WS, 'agent-1', input());

    expect(retry.body.pr_url).toBe(`https://github.com/${REPO}/pull/9`);
    expect(w.gh.prs).toHaveLength(1);
    expect(w.repo.installations).toHaveLength(1);
  });

  it('EC-10: an unchanged tree and no open PR → 409 ci_no_changes, no installation stored', async () => {
    const w = world();
    // the default branch already holds exactly these files and nobody has a PR open
    await w.svc.exportToPr(WS, 'agent-1', input());
    w.gh.baseTree = JSON.stringify(w.gh.commits[0]!.files);
    w.gh.openPr = null;
    w.repo.installations.length = 0;

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input()));

    expect(err.code).toBe('ci_no_changes');
    expect(err.statusCode).toBe(409);
    expect(err.message).toBe('The repository already contains these files');
    expect(w.repo.installations).toEqual([]);
  });

  it('EC-11: an edited workflow that is not YAML or is over 64 KiB → 422 before any GitHub call', async () => {
    const w = world();

    const notYaml = await caught(w.svc.exportToPr(WS, 'agent-1', input({ workflow_yaml: 'a: [unclosed' })));
    const huge = await caught(w.svc.exportToPr(WS, 'agent-1', input({ workflow_yaml: `x: ${'y'.repeat(65 * 1024)}` })));

    expect(notYaml.statusCode).toBe(422);
    expect(huge.statusCode).toBe(422);
    expect(w.gh.calls).toEqual([]);
  });

  it('UI-3: an edited workflow is committed at the fixed path; every other file is regenerated', async () => {
    const w = world();
    const edited = 'name: Edited\non: pull_request\njobs: {}\n';
    await w.svc.exportToPr(WS, 'agent-1', input({ workflow_yaml: edited }));

    const files = w.gh.commits[0]!.files;
    expect(files.filter((f) => f.path.endsWith('.yml')).map((f) => f.path)).toEqual([WORKFLOW_PATH]);
    expect(files.find((f) => f.path === WORKFLOW_PATH)!.contents).toBe(edited);
    expect(files.find((f) => f.path === '.devdigest/agents/security-reviewer.yaml')!.contents).toContain('Security Reviewer');
  });

  it('UI-4: a repository that is not connected in the workspace → 404, no GitHub call', async () => {
    const w = world();

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input({ repo: 'evil/unknown' })));

    expect(err.statusCode).toBe(404);
    expect(w.gh.calls).toEqual([]);
  });
});

// =============================================================================
// Export — zip path
// =============================================================================

describe('CiService.exportArchive', () => {
  it('AC-18: the zip is devdigest-ci-<repo-name>.zip and holds every Preview file at its repository path', async () => {
    const w = world();
    const preview = await w.svc.preview(WS, 'agent-1', input({ action: 'files' }));

    const { filename, bytes } = await w.svc.exportArchive(WS, 'agent-1', input({ action: 'files' }));

    expect(filename).toBe('devdigest-ci-payments-api.zip');
    expect(Object.keys(unzipSync(bytes)).sort()).toEqual(preview.files.map((f) => f.path).sort());
  });

  it('AC-19: downloading the zip stores the installation as manual and calls GitHub never', async () => {
    const w = world({ token: undefined }); // a zip needs no token

    await w.svc.exportArchive(WS, 'agent-1', input({ action: 'files' }));

    expect(w.repo.installations).toHaveLength(1);
    expect(w.repo.installations[0]).toMatchObject({ status: 'manual', prUrl: null, agentId: 'agent-1', workspaceId: WS });
    expect(w.gh.calls).toEqual([]);
  });

  it('AC-19: a zip for an installation that is already active leaves it active', async () => {
    const w = world();
    withInstallation(w, { status: 'active' });

    await w.svc.exportArchive(WS, 'agent-1', input({ action: 'files' }));

    expect(w.repo.installations[0]!.status).toBe('active');
  });

  it('NFR-5: the same inputs give a byte-identical zip', async () => {
    const w = world();
    const a = await w.svc.exportArchive(WS, 'agent-1', input({ action: 'files' }));
    const b = await w.svc.exportArchive(WS, 'agent-1', input({ action: 'files' }));

    expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes))).toBe(true);
  });
});

// =============================================================================
// Preview
// =============================================================================

describe('CiService.preview', () => {
  it('EC-3 / AC-31: preview needs no GitHub, lists the runner files without contents, and writes nothing', async () => {
    const w = world();

    const preview = await w.svc.preview(WS, 'agent-1', input());

    expect(w.gh.calls).toEqual([]);
    expect(w.repo.installations).toEqual([]);
    const runner = preview.files.filter((f) => f.kind === 'runner');
    expect(runner.map((f) => f.path).sort()).toEqual(['.devdigest/runner/index.js', '.devdigest/runner/package.json']);
    for (const f of runner) expect(f.contents).toBeNull();
  });

  it('AC-6: a runner file is read from the dist on demand; a path outside the listing is 404', async () => {
    const w = world();

    const file = await w.svc.previewFile(WS, 'agent-1', { ...input(), path: '.devdigest/runner/index.js' });
    expect(file.contents).toContain('runner');

    const missing = await caught(
      w.svc.previewFile(WS, 'agent-1', { ...input(), path: '.devdigest/runner/../../etc/passwd' }),
    );
    expect(missing.statusCode).toBeGreaterThanOrEqual(400);
    expect(missing.statusCode).toBeLessThan(500);
  });
});

// =============================================================================
// Installations list
// =============================================================================

describe('CiService.listInstallations', () => {
  it('AC-43: update_available when the workflow or the agent is newer than what was exported', async () => {
    const w = world();
    withInstallation(w, { id: 'i-current' });
    withInstallation(w, { id: 'i-old-wf', repo: 'acme/b', workflowVersion: WORKFLOW_VERSION - 1 });
    withInstallation(w, { id: 'i-old-agent', repo: 'acme/c', agentVersion: 2 });

    const items = await w.svc.listInstallations(WS);
    const flags = Object.fromEntries(items.map((i) => [i.id, i.update_available]));

    expect(flags).toEqual({ 'i-current': false, 'i-old-wf': true, 'i-old-agent': true });
  });

  it('EC-33: a never-run installation has last_run null; a stored run is reported as last_run', async () => {
    const w = world();
    const inst = withInstallation(w);
    expect((await w.svc.listInstallations(WS, 'agent-1'))[0]!.last_run).toBeNull();

    addRun(w, 1);
    await refreshOne(w, inst.id);
    expect((await w.svc.listInstallations(WS, 'agent-1'))[0]!.last_run).toMatchObject({ status: 'succeeded' });
  });

  it('NFR-1: another workspace sees none of them, and an agent of another workspace is 404', async () => {
    const w = world();
    withInstallation(w);
    w.repo.agents.push(agentRow({ id: 'agent-9', workspaceId: OTHER_WS }));

    expect(await w.svc.listInstallations(OTHER_WS)).toEqual([]);
    expect((await caught(w.svc.listInstallations(WS, 'agent-9'))).statusCode).toBe(404);
    expect((await caught(w.svc.preview(OTHER_WS, 'agent-1', input()))).statusCode).toBe(404);
    expect((await caught(w.svc.exportToPr(OTHER_WS, 'agent-1', input()))).statusCode).toBe(404);
  });
});

// =============================================================================
// Refresh
// =============================================================================

describe('CiService.refresh — what is read from GitHub', () => {
  it('AC-55: reads the 30 newest runs of the generated workflow file with event pull_request', async () => {
    const w = world();
    const inst = withInstallation(w);

    await refreshOne(w, inst.id);

    expect(w.gh.listOpts).toEqual([{ workflowPath: WORKFLOW_PATH, event: 'pull_request', perPage: 30 }]);
  });

  it('EC-1: a refresh without a stored token → 409 github_token_missing, no GitHub call', async () => {
    const w = world({ token: undefined });
    const inst = withInstallation(w);

    const err = await caught(refreshOne(w, inst.id));

    expect(err.code).toBe('github_token_missing');
    expect(w.gh.calls).toEqual([]);
  });

  it('AC-62: with no installation there is nothing to do — [] and no token needed', async () => {
    const w = world({ token: undefined });
    await expect(w.svc.refresh(WS, { force: false })).resolves.toEqual([]);
  });

  it('NFR-1: an installation of another workspace cannot be refreshed (404)', async () => {
    const w = world();
    const other = withInstallation(w, { workspaceId: OTHER_WS });

    const err = await caught(refreshOne(w, other.id));

    expect(err.statusCode).toBe(404);
    expect(w.gh.calls).toEqual([]);
  });
});

describe('CiService.refresh — debounce and single flight', () => {
  it('AC-54: a non-forced refresh within 30 s of the last one is skipped without a GitHub call; force overrides', async () => {
    const w = world();
    const inst = withInstallation(w, { lastRefreshedAt: new Date(Date.now() - 10_000) });

    const skipped = await w.svc.refresh(WS, { installation_id: inst.id, force: false });
    expect(skipped).toEqual([{ installation_id: inst.id, status: 'skipped', added: 0, updated: 0, skipped: 0, failure: null }]);
    expect(w.gh.calls).toEqual([]);

    const forced = await w.svc.refresh(WS, { installation_id: inst.id, force: true });
    expect(forced[0]!.status).toBe('refreshed');
    expect(w.gh.count('listWorkflowRuns')).toBe(1);
  });

  it('AC-54: a completed refresh starts the debounce window; an older one does not apply', async () => {
    const w = world();
    const inst = withInstallation(w, { lastRefreshedAt: new Date(Date.now() - 31_000) });

    expect((await w.svc.refresh(WS, { installation_id: inst.id, force: false }))[0]!.status).toBe('refreshed');
    expect((await w.svc.refresh(WS, { installation_id: inst.id, force: false }))[0]!.status).toBe('skipped');
    expect(w.gh.count('listWorkflowRuns')).toBe(1);
  });

  it('EC-27: a second refresh of an installation that is refreshing → 409 ci_refresh_running; the lock is then released', async () => {
    const w = world();
    const inst = withInstallation(w);
    let release!: () => void;
    w.gh.gate.listWorkflowRuns = new Promise<void>((r) => (release = r));

    const first = refreshOne(w, inst.id);
    await vi.waitFor(() => expect(w.gh.count('listWorkflowRuns')).toBe(1));

    const err = await caught(refreshOne(w, inst.id));
    expect(err.code).toBe('ci_refresh_running');
    expect(err.statusCode).toBe(409);

    release();
    await expect(first).resolves.toMatchObject([{ status: 'refreshed' }]);
    await expect(refreshOne(w, inst.id)).resolves.toMatchObject([{ status: 'refreshed' }]);
  });

  it('EC-27: in a workspace-wide refresh the busy installation is reported failed, the others proceed', async () => {
    const w = world();
    const a = withInstallation(w, { id: 'inst-a' });
    withInstallation(w, { id: 'inst-b', repo: 'acme/other', agentId: 'agent-2', manifestSlug: 'perf' });
    let release!: () => void;
    w.gh.gate.listWorkflowRuns = new Promise<void>((r) => (release = r));

    const first = refreshOne(w, a.id);
    await vi.waitFor(() => expect(w.gh.count('listWorkflowRuns')).toBe(1));
    delete w.gh.gate.listWorkflowRuns;

    const all = await w.svc.refresh(WS, { force: true });
    const byId = Object.fromEntries(all.map((r) => [r.installation_id, r]));
    expect(byId['inst-a']).toMatchObject({ status: 'failed', failure: { code: 'ci_refresh_running' } });
    expect(byId['inst-b']).toMatchObject({ status: 'refreshed', failure: null });

    release();
    await first;
  });
});

describe('CiService.refresh — run to CI run', () => {
  it('AC-57 / AC-58: a successful run with a verified artifact is stored once with counts, cost and duration', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 11);

    const [result] = await refreshOne(w, inst.id);

    expect(result).toEqual({ installation_id: inst.id, status: 'refreshed', added: 1, updated: 0, skipped: 0, failure: null });
    expect(w.repo.runs).toHaveLength(1);
    expect(w.repo.runs[0]).toMatchObject({
      workspaceId: WS,
      ciInstallationId: inst.id,
      repo: REPO,
      githubRunId: 11,
      runAttempt: 1,
      headSha: SHA,
      prNumber: 7,
      status: 'succeeded',
      verdict: 'request_changes', // ci_fail_on=critical and one critical finding
      failureReason: null,
      findingsCount: 3,
      critical: 1,
      warning: 1,
      suggestion: 1,
      costUsd: 0.02,
      durationMs: 1234,
      githubUrl: `https://github.com/${REPO}/actions/runs/11`,
    });
  });

  it('UI-9: the agent name shown is the installation\'s, never the artifact\'s "agent" text', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 11);

    await refreshOne(w, inst.id);

    expect(w.repo.runs[0]!.agentName).toBe('Security Reviewer');
  });

  it('AC-59: success with zero findings → no_findings (approve); a failed conclusion with a valid artifact → failed', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1, {}, resultZip({ result: { findings_count: 0, critical: 0, warning: 0, suggestion: 0 } }));
    addRun(w, 2, { conclusion: 'failure' });

    await refreshOne(w, inst.id);
    const byRun = Object.fromEntries(w.repo.runs.map((r) => [r.githubRunId, r]));

    expect(byRun[1]).toMatchObject({ status: 'no_findings', verdict: 'approve' });
    expect(byRun[2]).toMatchObject({ status: 'failed', failureReason: null, findingsCount: 3 });
  });

  it('AC-57: the first completed run flips a pending_pr installation to active', async () => {
    const w = world();
    const inst = withInstallation(w, { status: 'pending_pr' });
    addRun(w, 1);

    await refreshOne(w, inst.id);

    expect(w.repo.installations[0]!.status).toBe('active');
    expect(w.repo.installations[0]!.lastRefreshedAt).toBeInstanceOf(Date);
  });

  it('AC-56: an in-progress run is stored as running with no agent run, and replaced once it completes', async () => {
    const w = world();
    const inst = withInstallation(w);
    w.gh.runs.push(workflowRun(5, { status: 'in_progress', conclusion: null }));

    const first = await refreshOne(w, inst.id);
    expect(first[0]).toMatchObject({ added: 1, updated: 0 });
    expect(w.repo.runs).toHaveLength(1);
    expect(w.repo.runs[0]).toMatchObject({ status: 'running', findingsCount: null, costUsd: null });
    expect(w.repo.agentRuns).toEqual([]);
    expect(w.gh.count('listRunArtifacts')).toBe(0);

    w.gh.runs.length = 0;
    addRun(w, 5);
    const second = await refreshOne(w, inst.id);

    expect(second[0]).toMatchObject({ added: 0, updated: 1 });
    expect(w.repo.runs).toHaveLength(1);
    expect(w.repo.runs[0]).toMatchObject({ status: 'succeeded', findingsCount: 3 });
    expect(w.repo.agentRuns).toHaveLength(1);
  });

  it('AC-60: a completed run writes ONE done agent run for the installation\'s agent — cost, duration, findings, blockers — linked from the CI run', async () => {
    const w = world();
    const inst = withInstallation(w, { ciFailOn: 'warning' });
    addRun(w, 11);

    await refreshOne(w, inst.id);

    expect(w.repo.agentRuns).toHaveLength(1);
    const agentRun = w.repo.agentRuns[0]!;
    expect(agentRun).toMatchObject({
      workspaceId: WS,
      agentId: 'agent-1',
      status: 'done',
      costUsd: 0.02,
      durationMs: 1234,
      findingsCount: 3,
      blockers: 2, // critical + warning meet the `warning` gate
      error: null,
    });
    expect(w.repo.runs[0]!.agentRunId).toBe(agentRun.id);
    expect(agentRun.ciRunId).toBe(w.repo.runs[0]!.id);
  });

  it('AC-60: an unverifiable run writes a FAILED agent run carrying the reason and no numbers', async () => {
    const w = world();
    const inst = withInstallation(w);
    w.gh.runs.push(workflowRun(8)); // no artifact at all

    await refreshOne(w, inst.id);

    expect(w.repo.agentRuns).toHaveLength(1);
    expect(w.repo.agentRuns[0]).toMatchObject({
      status: 'failed',
      error: 'no_artifact',
      costUsd: null,
      durationMs: null,
      findingsCount: null,
      blockers: null,
    });
  });

  it('AC-61: re-meeting a stored completed run adds no CI run, no agent run and does not download again', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 11);
    await refreshOne(w, inst.id);
    const downloads = w.gh.count('downloadArtifact');

    const [again] = await refreshOne(w, inst.id);

    expect(again).toMatchObject({ added: 0, updated: 0, skipped: 1 });
    expect(w.repo.runs).toHaveLength(1);
    expect(w.repo.agentRuns).toHaveLength(1);
    expect(w.gh.count('downloadArtifact')).toBe(downloads);
  });

  it('AC-57: a rerun (same run id, attempt 2) is a separate CI run', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 11);
    addRun(w, 11, { run_attempt: 2 });

    await refreshOne(w, inst.id);

    expect(w.repo.runs.map((r) => [r.githubRunId, r.runAttempt])).toEqual([[11, 1], [11, 2]]);
  });

  it('EC-36: a run that concluded skipped stores nothing', async () => {
    const w = world();
    const inst = withInstallation(w);
    w.gh.runs.push(workflowRun(3, { conclusion: 'skipped' }));

    const [result] = await refreshOne(w, inst.id);

    expect(result).toMatchObject({ added: 0, skipped: 1 });
    expect(w.repo.runs).toEqual([]);
    expect(w.repo.agentRuns).toEqual([]);
  });

  it('EC-22: a completed run without the devdigest-result artifact → failed / no_artifact', async () => {
    const w = world();
    const inst = withInstallation(w);
    w.gh.runs.push(workflowRun(8));
    w.gh.artifactList[8] = [{ id: 1, name: 'something-else', size_in_bytes: 1, expired: false }];

    await refreshOne(w, inst.id);

    expect(w.repo.runs[0]).toMatchObject({
      status: 'failed',
      failureReason: 'no_artifact',
      findingsCount: null,
      costUsd: null,
      durationMs: null,
      verdict: null,
    });
    expect(w.gh.count('downloadArtifact')).toBe(0);
  });

  it('EC-23: an expired artifact (flag or 410) → failed / artifact_expired and the refresh carries on', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1);
    w.gh.artifactList[1]![0]!.expired = true; // flagged expired: never downloaded
    addRun(w, 2, {}, null); // download answers 410
    addRun(w, 3); // healthy, listed last

    const [result] = await refreshOne(w, inst.id);

    expect(result).toMatchObject({ status: 'refreshed', added: 3, failure: null });
    const byRun = Object.fromEntries(w.repo.runs.map((r) => [r.githubRunId, r]));
    expect(byRun[1]).toMatchObject({ status: 'failed', failureReason: 'artifact_expired' });
    expect(byRun[2]).toMatchObject({ status: 'failed', failureReason: 'artifact_expired' });
    expect(byRun[3]).toMatchObject({ status: 'succeeded' });
  });

  it.each([
    ['cancelled', 'cancelled'],
    ['timed_out', 'timed_out'],
  ])('EC-24: a %s run is stored failed with that reason, and its artifact is never fetched', async (conclusion, reason) => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 4, { conclusion });

    await refreshOne(w, inst.id);

    expect(w.repo.runs[0]).toMatchObject({ status: 'failed', failureReason: reason, findingsCount: null });
    expect(w.gh.count('listRunArtifacts')).toBe(0);
    expect(w.gh.count('downloadArtifact')).toBe(0);
    expect(w.repo.agentRuns[0]).toMatchObject({ status: 'failed', error: reason });
  });

  it('EC-21: a sidecar that disagrees with the run (sha, repository, PR) → failed / artifact_rejected', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1, {}, resultZip({ meta: { commit_sha: 'b'.repeat(40) } }));
    addRun(w, 2, {}, resultZip({ meta: { repository: 'evil/other' } }));
    addRun(w, 3, {}, resultZip({ meta: { pr_number: 99 } }));

    await refreshOne(w, inst.id);

    expect(w.repo.runs.map((r) => [r.status, r.failureReason])).toEqual([
      ['failed', 'artifact_rejected'],
      ['failed', 'artifact_rejected'],
      ['failed', 'artifact_rejected'],
    ]);
    expect(w.repo.runs.every((r) => r.findingsCount === null && r.costUsd === null)).toBe(true);
  });

  it('EC-20: garbage bytes instead of a zip → failed / artifact_rejected', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1, {}, strToU8('not a zip'));

    await refreshOne(w, inst.id);

    expect(w.repo.runs[0]).toMatchObject({ status: 'failed', failureReason: 'artifact_rejected' });
  });

  it('EC-18: a stored run keeps the repository and agent name written on it (the installation may be gone)', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1);
    await refreshOne(w, inst.id);

    w.repo.installations.length = 0; // the agent was deleted -> installations cascade away
    w.repo.agents.length = 0;
    const runs = await w.svc.listRuns(WS, { limit: 50 });

    expect(runs[0]).toMatchObject({ repo: REPO, agent_name: 'Security Reviewer' });
  });
});

describe('CiService.refresh — origin checks (UI-10)', () => {
  it('UI-10: runs of another workflow path, event or head repository are skipped, never downloaded', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1, { path: '.github/workflows/evil.yml' });
    addRun(w, 2, { event: 'workflow_dispatch' });
    addRun(w, 3, { head_repository_full_name: 'fork/payments-api' });
    addRun(w, 4, { head_repository_full_name: null });
    addRun(w, 5, { path: `${WORKFLOW_PATH}@refs/heads/main` }); // GitHub's @ref suffix is fine
    addRun(w, 6, { head_repository_full_name: 'ACME/Payments-API' }); // case-insensitive

    const [result] = await refreshOne(w, inst.id);

    expect(result).toMatchObject({ added: 2, skipped: 4 });
    expect(w.repo.runs.map((r) => r.githubRunId)).toEqual([5, 6]);
    expect(w.gh.count('listRunArtifacts')).toBe(2);
  });

  it('UI-11: a job URL that is not a github.com run of the repository is not stored', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1, { html_url: 'https://evil.example/acme/payments-api/actions/runs/1' });

    await refreshOne(w, inst.id);

    expect(w.repo.runs[0]!.githubUrl).toBeNull();
  });
});

describe('CiService.refresh — GitHub failures', () => {
  it('EC-25: github_permission on an active installation is the answer and leaves stored rows unchanged', async () => {
    const w = world();
    const inst = withInstallation(w, { status: 'active' });
    addRun(w, 1);
    await refreshOne(w, inst.id);
    const before = JSON.stringify(w.repo.runs);
    const stamp = w.repo.installations[0]!.lastRefreshedAt;
    w.gh.fail.listWorkflowRuns = new AppError('github_permission', 'GitHub rejected the request', 403, { operation: 'list_workflow_runs', status: 403 });

    const err = await caught(refreshOne(w, inst.id));

    expect(err.code).toBe('github_permission');
    expect(JSON.stringify(w.repo.runs)).toBe(before);
    expect(w.repo.installations[0]!.lastRefreshedAt).toBe(stamp);
  });

  it.each(['pending_pr', 'manual'] as const)(
    'UI-8 / EC-25: a 404 (workflow file not merged yet) for a %s installation means zero runs, not an error',
    async (status) => {
      const w = world();
      const inst = withInstallation(w, { status });
      w.gh.fail.listWorkflowRuns = new AppError('github_permission', 'Not Found', 404, { operation: 'list_workflow_runs', status: 404 });

      const [result] = await refreshOne(w, inst.id);

      expect(result).toEqual({ installation_id: inst.id, status: 'refreshed', added: 0, updated: 0, skipped: 0, failure: null });
      expect(w.repo.installations[0]!.status).toBe(status); // still not active
      expect(w.repo.installations[0]!.lastRefreshedAt).toBeInstanceOf(Date);
    },
  );

  it.each(['pending_pr', 'manual'] as const)(
    'EC-25: a 403 for a %s installation is github_permission, not "no runs": nothing is stored and the clock is not advanced',
    async (status) => {
      const w = world();
      const inst = withInstallation(w, { status });
      w.gh.fail.listWorkflowRuns = new AppError('github_permission', 'GitHub denied access', 403, { operation: 'list_workflow_runs', status: 403 });

      const err = await caught(refreshOne(w, inst.id));

      expect(err.code).toBe('github_permission');
      expect(w.repo.runs).toEqual([]);
      expect(w.repo.installations[0]!.lastRefreshedAt).toBeNull();
    },
  );

  it('B2: an active installation answers github_permission for a 404 as well', async () => {
    const w = world();
    const inst = withInstallation(w, { status: 'active' });
    w.gh.fail.listWorkflowRuns = new AppError('github_permission', 'Not Found', 403, { operation: 'list_workflow_runs', status: 404 });

    const err = await caught(refreshOne(w, inst.id));

    expect(err.code).toBe('github_permission');
  });

  it('S1: a forged pr_number beyond 32 bits is artifact_rejected (a failed row), never a DB error', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1, {}, resultZip({ result: { pr_number: 99_999_999_999 }, meta: { pr_number: 99_999_999_999 } }));

    const [result] = await refreshOne(w, inst.id);

    expect(result).toMatchObject({ status: 'refreshed', added: 1, failure: null });
    expect(w.repo.runs[0]).toMatchObject({ status: 'failed', failureReason: 'artifact_rejected', findingsCount: null });
  });

  it('S1: an unexpected error while ingesting one installation fails only that installation, with fixed text', async () => {
    const w = world();
    withInstallation(w, { id: 'inst-a' });
    withInstallation(w, { id: 'inst-b', repo: 'acme/other', agentId: 'agent-2', manifestSlug: 'perf' });
    const save = w.repo.saveCompletedRunWithAgentRun.bind(w.repo);
    vi.spyOn(w.repo, 'saveCompletedRunWithAgentRun').mockImplementation(async (run, agentRun) => {
      if (run.repo === 'acme/other') throw new TypeError(`value out of range ${GH_TOKEN}`);
      return save(run, agentRun);
    });
    // the spy lists every run for every repo; the origin check keeps each run with its own installation
    addRun(w, 1);
    addRun(w, 2, { head_repository_full_name: 'acme/other' });
    w.gh.zips[artifactId(2)] = resultZip({ meta: { repository: 'acme/other' } });

    const results = await w.svc.refresh(WS, { force: true });
    const byId = Object.fromEntries(results.map((r) => [r.installation_id, r]));

    expect(byId['inst-a']).toMatchObject({ status: 'refreshed', failure: null });
    expect(byId['inst-b']).toMatchObject({ status: 'failed', failure: { code: 'ingest_failed' } });
    expect(JSON.stringify(results)).not.toContain(GH_TOKEN);
    expect(w.repo.installations.find((i) => i.id === 'inst-b')!.lastRefreshedAt).toBeNull();
  });

  it('EC-26: a rate limit stops the refresh with rate_limited + reset_at; rows already stored stay and the clock is not advanced', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1);
    // run 2 is listed after run 1; its artifact download hits the limit
    addRun(w, 2);
    const reset = '2026-06-01T13:00:00.000Z';
    const rateLimit = new AppError('rate_limited', 'GitHub rate limit reached', 429, { reset_at: reset });
    const download = w.gh.downloadArtifact.bind(w.gh);
    vi.spyOn(w.gh, 'downloadArtifact').mockImplementation(async (r, id) => {
      if (id === artifactId(2)) throw rateLimit;
      return download(r, id);
    });

    const err = await caught(refreshOne(w, inst.id));

    expect(err.code).toBe('rate_limited');
    expect(err.statusCode).toBe(429);
    expect((err.details as { reset_at: string }).reset_at).toBe(reset);
    expect(w.repo.runs.map((r) => r.githubRunId)).toContain(1);
    expect(w.repo.runs.map((r) => r.githubRunId)).not.toContain(2);
    expect(w.repo.installations[0]!.lastRefreshedAt).toBeNull();
  });

  it('EC-26 / AC-62: workspace-wide, a rate-limited installation reports failure.code + reset_at while the others finish', async () => {
    const w = world();
    withInstallation(w, { id: 'inst-a' });
    withInstallation(w, { id: 'inst-b', repo: 'acme/other', agentId: 'agent-2', manifestSlug: 'perf' });
    const reset = '2026-06-01T13:00:00.000Z';
    const list = w.gh.listWorkflowRuns.bind(w.gh);
    vi.spyOn(w.gh, 'listWorkflowRuns').mockImplementation(async (repo, opts) => {
      if (repo.name === 'other') throw new AppError('rate_limited', 'GitHub rate limit reached', 429, { reset_at: reset });
      return list(repo, opts);
    });

    const results = await w.svc.refresh(WS, { force: true });
    const byId = Object.fromEntries(results.map((r) => [r.installation_id, r]));

    expect(byId['inst-a']).toMatchObject({ status: 'refreshed', failure: null });
    expect(byId['inst-b']).toMatchObject({ status: 'failed', failure: { code: 'rate_limited', reset_at: reset } });
  });

  it('EC-28: a run that has been running for more than 24 h is failed / stale on the next refresh', async () => {
    const w = world();
    const inst = withInstallation(w);
    w.repo.runs.push({
      id: 'run-old', workspaceId: WS, ciInstallationId: inst.id, repo: REPO, agentName: 'Security Reviewer',
      githubRunId: 77, runAttempt: 1, status: 'running', ranAt: new Date(Date.now() - 25 * 3_600_000),
      ingestedAt: new Date(Date.now() - 25 * 3_600_000),
    } as unknown as CiRunRow);
    w.repo.runs.push({
      id: 'run-new', workspaceId: WS, ciInstallationId: inst.id, repo: REPO, agentName: 'Security Reviewer',
      githubRunId: 78, runAttempt: 1, status: 'running', ranAt: new Date(Date.now() - 3_600_000),
      ingestedAt: new Date(Date.now() - 3_600_000),
    } as unknown as CiRunRow);

    await refreshOne(w, inst.id);

    const byRun = Object.fromEntries(w.repo.runs.map((r) => [r.githubRunId, r]));
    expect(byRun[77]).toMatchObject({ status: 'failed', failureReason: 'stale' });
    expect(byRun[78]!.status).toBe('running');
  });

  it('NFR-10: past the 50 s deadline the refresh stops with refresh_timeout and stores nothing further', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1);
    w.gh.onList = () => vi.setSystemTime(new Date(T0.getTime() + 51_000));

    const err = await caught(refreshOne(w, inst.id));

    expect(err.code).toBe('refresh_timeout');
    expect(err.statusCode).toBe(504);
    expect(w.repo.runs).toEqual([]);
    expect(w.repo.installations[0]!.lastRefreshedAt).toBeNull();
  });
});

describe('CiService.refresh — budgets', () => {
  it('NFR-9: one refresh of 30 completed runs makes exactly 1 + 30 + 30 = 61 GitHub calls, at most 5 downloads at once', async () => {
    const w = world();
    const inst = withInstallation(w);
    for (let id = 1; id <= 30; id++) addRun(w, id);

    const [result] = await refreshOne(w, inst.id);

    expect(result).toMatchObject({ status: 'refreshed', added: 30 });
    expect(w.gh.calls).toHaveLength(61);
    expect(w.gh.count('listWorkflowRuns')).toBe(1);
    expect(w.gh.count('listRunArtifacts')).toBe(30);
    expect(w.gh.count('downloadArtifact')).toBe(30);
    expect(w.gh.maxInFlight).toBeLessThanOrEqual(REFRESH_CONCURRENCY);
    expect(w.gh.maxInFlight).toBeGreaterThan(1);
  });

  it('NFR-9: re-running the same 30 stored runs costs one call (AC-61 keeps the budget flat)', async () => {
    const w = world();
    const inst = withInstallation(w);
    for (let id = 1; id <= 30; id++) addRun(w, id);
    await refreshOne(w, inst.id);
    w.gh.calls.length = 0;

    await refreshOne(w, inst.id);

    expect(w.gh.calls).toEqual(['listWorkflowRuns']);
  });
});

// =============================================================================
// Runs list, LLM, secrets
// =============================================================================

describe('CiService.listRuns', () => {
  it('AC-63: answers from stored rows and never calls GitHub', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1);
    await refreshOne(w, inst.id);
    w.gh.calls.length = 0;

    const runs = await w.svc.listRuns(WS, { limit: 50 });

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: expect.any(String), installation_id: inst.id, status: 'succeeded', pr_number: 7 });
    expect(w.gh.calls).toEqual([]);
  });

  it('NFR-1: another workspace lists none of the first one\'s runs', async () => {
    const w = world();
    const inst = withInstallation(w);
    addRun(w, 1);
    await refreshOne(w, inst.id);

    expect(await w.svc.listRuns(OTHER_WS, { limit: 50 })).toEqual([]);
  });
});

describe('NFR-11 / NFR-12', () => {
  it('NFR-11: preview, export, zip, refresh and listings make zero LLM calls', async () => {
    const w = world();
    await w.svc.preview(WS, 'agent-1', input());
    const { body } = await w.svc.exportToPr(WS, 'agent-1', input());
    await w.svc.exportArchive(WS, 'agent-1', input({ repo: REPO }));
    addRun(w, 1);
    await refreshOne(w, body.installation.id);
    await w.svc.listInstallations(WS);
    await w.svc.listRuns(WS, { limit: 50 });

    expect(w.llm).not.toHaveBeenCalled();
  });

  it('NFR-12: neither credential is in any committed file, the PR body, the zip or the responses', async () => {
    const w = world();
    const exported = await w.svc.exportToPr(WS, 'agent-1', input());
    const zip = await w.svc.exportArchive(WS, 'agent-1', input({ action: 'files' }));
    const preview = await w.svc.preview(WS, 'agent-1', input());

    const haystack = [
      ...w.gh.commits.flatMap((c) => [c.message, ...c.files.map((f) => f.contents)]),
      ...w.gh.prs.flatMap((p) => [p.title, p.body]),
      ...Object.values(unzipSync(zip.bytes)).map((b) => Buffer.from(b).toString('utf8')),
      JSON.stringify(exported),
      JSON.stringify(preview),
    ].join('\n');

    expect(haystack).not.toContain(GH_TOKEN);
    expect(haystack).not.toContain(OR_KEY);
    // the workflow refers to the secret by NAME only
    expect(haystack).toContain('secrets.OPENROUTER_API_KEY');
  });

  it.each([
    ['export (commit)', 'commitFiles'],
    ['export (PR lookup)', 'findOpenPr'],
  ] as const)('NFR-12: a GitHub error that quotes the token is scrubbed and capped at 200 characters — %s', async (_label, method) => {
    const w = world();
    w.gh.fail[method] = new Error(`Bad credentials ${GH_TOKEN} Bearer ${GH_TOKEN} ${'x'.repeat(500)}`);

    const err = await caught(w.svc.exportToPr(WS, 'agent-1', input()));

    // a failed PR lookup is reported as ci_pr_failed (fixed text); a commit failure carries scrubbed GitHub text
    expect(err.message).not.toContain(GH_TOKEN);
    expect(err.message.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(err.details ?? null)).not.toContain(GH_TOKEN);
  });

  it('NFR-12: a refresh error that quotes the token is scrubbed and capped at 200 characters', async () => {
    const w = world();
    const inst = withInstallation(w, { status: 'active' });
    w.gh.fail.listWorkflowRuns = new Error(`HttpError: Bad credentials ${GH_TOKEN} ${'y'.repeat(500)}`);

    const err = await caught(refreshOne(w, inst.id));

    expect(err.message).not.toContain(GH_TOKEN);
    expect(err.message.length).toBeLessThanOrEqual(200);
  });
});
