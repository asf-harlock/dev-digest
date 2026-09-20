import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConventionsService } from '../src/modules/conventions/service.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { NotFoundError, ValidationError } from '../src/platform/errors.js';
import { CONVENTIONS_FALLBACK_MODEL } from '../src/modules/conventions/constants.js';
import type { Container } from '../src/platform/container.js';

/**
 * Hermetic — no Postgres, no network. `container.repoIntel`/`container.llm`
 * are stubbed (template: `test/repo-intel-facade-degraded.test.ts`'s "patch
 * the private field" style); the clone is a real temp directory so
 * `readFiles`/`findConfigFiles` exercise real, small filesystem I/O.
 */

const SNIPPET = 'const user = await db.users.find(id);';
const FILE_CONTENT = [
  'export async function getUser(id: string) {',
  `  ${SNIPPET}`,
  '  return user;',
  '}',
].join('\n');

async function makeClone(opts: { withConfig?: boolean } = {}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'conventions-service-test-'));
  await mkdir(join(dir, 'src', 'api'), { recursive: true });
  await writeFile(join(dir, 'src', 'api', 'users.ts'), FILE_CONTENT, 'utf8');
  if (opts.withConfig ?? true) {
    await writeFile(join(dir, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}', 'utf8');
  }
  return dir;
}

function buildContainer(opts: {
  clonePath: string | null;
  llm: MockLLMProvider;
  featureModelOverride?: { provider: 'openai' | 'anthropic' | 'openrouter'; model: string };
}): Container {
  return {
    db: {} as never,
    config: { repoIntelEnabled: true } as never,
    repoIntel: {
      getConventionSamples: async () => (opts.clonePath ? ['src/api/users.ts'] : []),
    } as never,
    llm: async () => opts.llm,
  } as unknown as Container;
}

function patchRepo(
  svc: ConventionsService,
  opts: {
    clonePath: string | null;
    fullName?: string;
    featureModelOverride?: { provider: 'openai' | 'anthropic' | 'openrouter'; model: string };
  },
): { replaceAllCalls: unknown[] } {
  const replaceAllCalls: unknown[] = [];
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getRepoClonePath: async () =>
      opts.clonePath === null && opts.fullName === undefined
        ? null
        : { clonePath: opts.clonePath, fullName: opts.fullName ?? 'acme/repo' },
    getFeatureModelOverride: async () => opts.featureModelOverride,
    replaceAll: async (
      _workspaceId: string,
      _repoId: string,
      scan: {
        sampleFileCount: number;
        configFileCount: number;
        mode: string;
        provider: string | null;
        model: string | null;
      },
      candidates: unknown[],
    ) => {
      replaceAllCalls.push({ scan, candidates });
      return {
        scan: {
          id: 'scan-1',
          workspaceId: 'w1',
          repoId: 'r1',
          sampleFileCount: scan.sampleFileCount,
          configFileCount: scan.configFileCount,
          candidateCount: candidates.length,
          mode: scan.mode,
          provider: scan.provider,
          model: scan.model,
          createdAt: new Date(),
        },
        rows: candidates.map((c, i) => ({
          id: `c${i}`,
          workspaceId: 'w1',
          repoId: 'r1',
          scanId: 'scan-1',
          createdAt: new Date(),
          status: 'pending',
          ...(c as object),
        })),
      };
    },
  };
  return { replaceAllCalls };
}

describe('ConventionsService.extract', () => {
  let clonePath: string | undefined;

  afterEach(async () => {
    if (clonePath) await rm(clonePath, { recursive: true, force: true });
    clonePath = undefined;
  });

  it('drops a candidate whose evidence does not verify', async () => {
    clonePath = await makeClone();
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
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
            {
              category: 'style',
              rule: 'A hallucinated rule',
              evidence_path: 'src/api/does-not-exist.ts',
              start_line: 1,
              end_line: 1,
              snippet: 'nonexistent code',
              confidence: 0.8,
            },
          ],
        },
      },
    });
    const container = buildContainer({ clonePath, llm });
    const svc = new ConventionsService(container);
    const { replaceAllCalls } = patchRepo(svc, { clonePath });

    const result = await svc.extract('w1', 'r1', 'ai');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rule).toBe('Always await db calls');
    expect((replaceAllCalls[0] as { candidates: unknown[] }).candidates).toHaveLength(1);
  });

  it('uses the fallback cheap model when no workspace override exists', async () => {
    clonePath = await makeClone();
    const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { candidates: [] } } });
    const container = buildContainer({ clonePath, llm });
    const svc = new ConventionsService(container);
    patchRepo(svc, { clonePath, featureModelOverride: undefined });

    const result = await svc.extract('w1', 'r1', 'ai');
    expect(result.scan?.model).toBe(CONVENTIONS_FALLBACK_MODEL);
    expect(result.scan?.provider).toBe('openai');
  });

  it('honours a workspace feature-model override', async () => {
    clonePath = await makeClone();
    const llm = new MockLLMProvider('openai', { structuredBySchema: { ConventionExtraction: { candidates: [] } } });
    const container = buildContainer({ clonePath, llm });
    const svc = new ConventionsService(container);
    patchRepo(svc, { clonePath, featureModelOverride: { provider: 'openai', model: 'gpt-5.4' } });

    const result = await svc.extract('w1', 'r1', 'ai');
    expect(result.scan?.model).toBe('gpt-5.4');
  });

  it('throws NotFoundError when the repo does not exist', async () => {
    const llm = new MockLLMProvider('openai');
    const container = buildContainer({ clonePath: null, llm });
    const svc = new ConventionsService(container);
    patchRepo(svc, { clonePath: null });

    await expect(svc.extract('w1', 'r1', 'both')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws ValidationError when the repo has never been cloned', async () => {
    const llm = new MockLLMProvider('openai');
    const container = buildContainer({ clonePath: null, llm });
    const svc = new ConventionsService(container);
    patchRepo(svc, { clonePath: null, fullName: 'acme/repo' });

    await expect(svc.extract('w1', 'r1', 'both')).rejects.toBeInstanceOf(ValidationError);
  });

  it("mode 'local' derives candidates from config files and never calls the model", async () => {
    clonePath = await makeClone();
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { ConventionExtraction: { candidates: [{ shouldNot: 'be called' }] } },
    });
    const container = buildContainer({ clonePath, llm });
    const svc = new ConventionsService(container);
    const { replaceAllCalls } = patchRepo(svc, { clonePath });

    const result = await svc.extract('w1', 'r1', 'local');

    expect(result.scan?.mode).toBe('local');
    expect(result.scan?.provider).toBeNull();
    expect(result.scan?.model).toBeNull();
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rule).toContain('strict');
    expect((replaceAllCalls[0] as { scan: { sampleFileCount: number } }).scan.sampleFileCount).toBe(0);
  });

  it("mode 'local' throws ValidationError when there are no config files to parse", async () => {
    clonePath = await makeClone({ withConfig: false });
    const llm = new MockLLMProvider('openai');
    const container = buildContainer({ clonePath, llm });
    const svc = new ConventionsService(container);
    patchRepo(svc, { clonePath });

    await expect(svc.extract('w1', 'r1', 'local')).rejects.toBeInstanceOf(ValidationError);
  });

  it("mode 'local' finds a config one level into a sub-package, not only at the repo root", async () => {
    clonePath = await makeClone({ withConfig: false });
    await mkdir(join(clonePath, 'server'), { recursive: true });
    await writeFile(
      join(clonePath, 'server', 'tsconfig.json'),
      '{"compilerOptions":{"noUncheckedIndexedAccess":true}}',
      'utf8',
    );
    const llm = new MockLLMProvider('openai');
    const container = buildContainer({ clonePath, llm });
    const svc = new ConventionsService(container);
    const { replaceAllCalls } = patchRepo(svc, { clonePath });

    const result = await svc.extract('w1', 'r1', 'local');

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.rule).toContain('noUncheckedIndexedAccess');
    expect((replaceAllCalls[0] as { scan: { configFileCount: number } }).scan.configFileCount).toBe(1);
  });

  it("mode 'both' pools local and AI candidates into one replaceAll call", async () => {
    clonePath = await makeClone();
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionExtraction: {
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
        },
      },
    });
    const container = buildContainer({ clonePath, llm });
    const svc = new ConventionsService(container);
    patchRepo(svc, { clonePath });

    const result = await svc.extract('w1', 'r1', 'both');

    expect(result.scan?.mode).toBe('both');
    expect(result.scan?.model).toBe(CONVENTIONS_FALLBACK_MODEL);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.rule)).toContain('Always await db calls');
  });
});
