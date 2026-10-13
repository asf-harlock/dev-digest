import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { eq } from 'drizzle-orm';
import type { OpenPrPayload, RepoRef, WorkflowRun } from '@devdigest/shared';
import * as t from '../../src/db/schema.js';
import { MockGitHubClient } from '../../src/adapters/mocks.js';
import type { PgFixture } from './pg.js';

/**
 * Shared fixtures of the SPEC-12 (Export to CI) integration tests: a runner dist on
 * disk, rows in the DB, and workflow-run / artifact builders for `MockGitHubClient`.
 */

type Db = PgFixture['handle']['db'];

export const CI_SHA = 'c'.repeat(40);
export const WORKFLOW_FILE = '.github/workflows/devdigest-review.yml';

/** A built-runner stand-in (`index.js` + `package.json`); remove it with the returned `cleanup`. */
export function makeRunnerDist(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'ci-it-dist-'));
  writeFileSync(join(dir, 'index.js'), 'console.log("runner");\n');
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}\n');
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export const suffix = (): string => Math.random().toString(36).slice(2, 10);

export async function defaultWorkspaceId(db: Db): Promise<string> {
  const [ws] = await db
    .select({ id: t.workspaces.id })
    .from(t.workspaces)
    .where(eq(t.workspaces.name, 'default'));
  return ws!.id;
}

export async function insertWorkspace(db: Db, name = `ws-${suffix()}`): Promise<string> {
  const [row] = await db.insert(t.workspaces).values({ name }).returning({ id: t.workspaces.id });
  return row!.id;
}

export async function insertAgent(
  db: Db,
  workspaceId: string,
  over: Partial<typeof t.agents.$inferInsert> = {},
) {
  const [row] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name: `CI Agent ${suffix()}`,
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet',
      systemPrompt: 'Review the diff.',
      ...over,
    })
    .returning();
  return row!;
}

export async function insertRepo(db: Db, workspaceId: string, fullName = `acme/ci-${suffix()}`) {
  const [owner, name] = fullName.split('/') as [string, string];
  const [row] = await db
    .insert(t.repos)
    .values({ workspaceId, owner, name, fullName, defaultBranch: 'trunk' })
    .returning();
  return row!;
}

export function workflowRun(repo: string, id: number, over: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id,
    run_attempt: 1,
    status: 'completed',
    conclusion: 'success',
    head_sha: CI_SHA,
    event: 'pull_request',
    path: WORKFLOW_FILE,
    head_repository_full_name: repo,
    html_url: `https://github.com/${repo}/actions/runs/${id}`,
    created_at: new Date(Date.now() - 120_000).toISOString(),
    run_started_at: new Date(Date.now() - 115_000).toISOString(),
    updated_at: new Date(Date.now() - 60_000).toISOString(),
    pull_requests: [7],
    ...over,
  };
}

export function resultZip(
  repo: string,
  over: { result?: object; meta?: object } = {},
): Uint8Array {
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
  const meta = { commit_sha: CI_SHA, repository: repo, pr_number: 7, ...over.meta };
  return zipSync({
    'devdigest-result.json': strToU8(JSON.stringify(result)),
    'devdigest-run.json': strToU8(JSON.stringify(meta)),
  });
}

/**
 * `MockGitHubClient` whose pull-request URLs belong to the repository (the service only
 * trusts those) and whose "open PR of a branch" is tracked PER REPOSITORY, like GitHub.
 */
export class CiMockGitHub extends MockGitHubClient {
  private open = new Map<string, string>();

  override async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    await super.openPullRequest(repo, payload);
    const url = `https://github.com/${repo.owner}/${repo.name}/pull/9`;
    this.open.set(`${repo.owner}/${repo.name}:${payload.head}`.toLowerCase(), url);
    return { url };
  }

  override async findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    const url = this.open.get(`${repo.owner}/${repo.name}:${branch}`.toLowerCase());
    return url ? { url } : null;
  }
}
