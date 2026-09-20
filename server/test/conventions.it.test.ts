import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

const SNIPPET = 'const user = await db.users.find(id);';
const FILE_CONTENT = [
  'export async function getUser(id: string) {',
  `  ${SNIPPET}`,
  '  return user;',
  '}',
].join('\n');

const CANDIDATE_FIXTURE = {
  candidates: [
    {
      category: 'error_handling',
      rule: 'Always await db calls',
      evidence_path: 'src/api/users.ts',
      start_line: 2,
      end_line: 2,
      snippet: SNIPPET,
      confidence: 0.9,
    },
  ],
};

/** A degraded-but-typed RepoIntel stub — the extraction route only reads `getConventionSamples`. */
function stubRepoIntel(samplePaths: string[]): RepoIntel {
  const notImplemented = () => {
    throw new Error('not implemented in this stub');
  };
  return {
    indexRepo: notImplemented,
    refreshIndex: notImplemented,
    getIndexState: notImplemented,
    getBlastRadius: notImplemented,
    getRepoMap: notImplemented,
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => samplePaths,
    getTopFilesByRank: async () => samplePaths,
    getCriticalPaths: async () => [],
  } as unknown as RepoIntel;
}

d('conventions module', () => {
  let pg: PgFixture;
  let clonePath: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    clonePath = await mkdtemp(join(tmpdir(), 'conventions-it-'));
    await mkdir(join(clonePath, 'src', 'api'), { recursive: true });
    await writeFile(join(clonePath, 'src', 'api', 'users.ts'), FILE_CONTENT, 'utf8');
    await writeFile(join(clonePath, 'tsconfig.json'), '{}', 'utf8');
  });
  afterAll(async () => {
    await pg?.stop();
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
  });

  function makeApp(llmFixture: unknown = CANDIDATE_FIXTURE) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        repoIntel: stubRepoIntel(['src/api/users.ts']),
        llm: { openai: new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: llmFixture } }) },
      },
    });
  }

  let repoSeq = 0;
  async function seedRepo(db: PgFixture['handle']['db'], workspaceId: string) {
    const name = `conventions-${repoSeq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}`, clonePath })
      .returning();
    return repo!;
  }

  async function defaultWorkspaceId(): Promise<string> {
    const [ws] = await pg.handle.db.select().from(t.workspaces).limit(1);
    return ws!.id;
  }

  it('extracts, lists, patches and drafts a skill end to end', async () => {
    const app = await makeApp();
    const workspaceId = await defaultWorkspaceId();
    const repo = await seedRepo(pg.handle.db, workspaceId);

    const extractRes = await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` });
    expect(extractRes.statusCode).toBe(200);
    const extracted = extractRes.json();
    expect(extracted.candidates).toHaveLength(1);
    expect(extracted.candidates[0]).toMatchObject({
      rule: 'Always await db calls',
      status: 'pending',
      evidence: { path: 'src/api/users.ts', start_line: 2, end_line: 2 },
    });
    expect(extracted.scan).toMatchObject({ sample_file_count: 1, config_file_count: 1, candidate_count: 1 });
    const candidateId = extracted.candidates[0].id as string;

    const listRes = await app.inject({ method: 'GET', url: `/repos/${repo.id}/conventions` });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().candidates).toHaveLength(1);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/conventions/${candidateId}`,
      payload: { status: 'accepted' },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().status).toBe('accepted');

    const draftRes = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/draft-skills`,
      payload: { candidate_ids: [candidateId], grouping: 'merge' },
    });
    expect(draftRes.statusCode).toBe(200);
    const drafts = draftRes.json();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      name: 'always-await-db-calls',
      type: 'convention',
      evidence_files: ['src/api/users.ts'],
    });

    // Prove the skills-module evidence_files plumbing fix: the draft round-trips
    // through the EXISTING POST /skills unchanged.
    const skillName = `${drafts[0].name}-${Date.now()}`;
    const createSkillRes = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...drafts[0], name: skillName, source: 'extracted' },
    });
    expect(createSkillRes.statusCode).toBe(201);
    expect(createSkillRes.json()).toMatchObject({
      name: skillName,
      source: 'extracted',
      evidence_files: ['src/api/users.ts'],
    });

    // draft-skills never wrote to the DB — still exactly one convention row.
    const conventionsAfterDraft = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repo.id));
    expect(conventionsAfterDraft).toHaveLength(1);

    await app.close();
  });

  it('draft-skills rejects a candidate that is not accepted', async () => {
    const app = await makeApp();
    const workspaceId = await defaultWorkspaceId();
    const repo = await seedRepo(pg.handle.db, workspaceId);
    const extracted = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })
    ).json();
    const candidateId = extracted.candidates[0].id as string;

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repo.id}/conventions/draft-skills`,
      payload: { candidate_ids: [candidateId], grouping: 'merge' },
    });
    expect(res.statusCode).toBe(422);

    await app.close();
  });

  it('re-scan replaces the prior batch entirely', async () => {
    const app = await makeApp();
    const workspaceId = await defaultWorkspaceId();
    const repo = await seedRepo(pg.handle.db, workspaceId);

    const first = (
      await app.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })
    ).json();
    const firstId = first.candidates[0].id as string;

    const app2 = await makeApp({
      candidates: [
        {
          category: 'style',
          rule: 'Different rule this time',
          evidence_path: 'src/api/users.ts',
          start_line: 1,
          end_line: 1,
          snippet: 'export async function getUser(id: string) {',
          confidence: 0.7,
        },
      ],
    });
    const second = (
      await app2.inject({ method: 'POST', url: `/repos/${repo.id}/conventions/extract` })
    ).json();
    expect(second.candidates).toHaveLength(1);
    expect(second.candidates[0].id).not.toBe(firstId);
    expect(second.candidates[0].rule).toBe('Different rule this time');

    const listed = await pg.handle.db.select().from(t.conventions).where(eq(t.conventions.repoId, repo.id));
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(second.candidates[0].id);

    await app.close();
    await app2.close();
  });

  it('a repo in another workspace is a 404 here (workspace scoping)', async () => {
    const app = await makeApp();
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-${Date.now()}` })
      .returning();
    const [foreignRepo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'acme', name: 'foreign', fullName: 'acme/foreign' })
      .returning();

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${foreignRepo!.id}/conventions/extract`,
    });
    expect(res.statusCode).toBe(404);

    await app.close();
  });
});
