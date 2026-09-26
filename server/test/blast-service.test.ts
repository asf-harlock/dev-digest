import { describe, it, expect, vi } from 'vitest';
import { BlastService } from '../src/modules/blast/service.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { Container } from '../src/platform/container.js';
import type { BlastFacadeResult } from '../src/modules/blast/helpers.js';
import type { BlastPull } from '../src/modules/blast/repository.js';

/**
 * Hermetic — no Postgres. `BlastRepository` is patched onto the private
 * `repo` field (template: `test/conventions-service.test.ts`'s `patchRepo`),
 * and `container.repoIntel.getBlastRadius` is a spy so orchestration (not
 * persistence or the pure mapping already covered by `blast-helpers.test.ts`)
 * is what's under test here.
 */

const EMPTY_RESULT: BlastFacadeResult = {
  changedSymbols: [],
  callers: [],
  impactedEndpoints: [],
};

function buildContainer(getBlastRadius: ReturnType<typeof vi.fn>): Container {
  return {
    db: {} as never,
    repoIntel: { getBlastRadius } as unknown as Container['repoIntel'],
  } as unknown as Container;
}

function patchRepo(
  svc: BlastService,
  opts: { pull: BlastPull | undefined; changedFiles?: string[] },
): { getPullCalls: unknown[][] } {
  const getPullCalls: unknown[][] = [];
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    getPull: async (workspaceId: string, prId: string) => {
      getPullCalls.push([workspaceId, prId]);
      return opts.pull;
    },
    getChangedFiles: async (_prId: string) => opts.changedFiles ?? [],
  };
  return { getPullCalls };
}

describe('BlastService.getBlastRadius', () => {
  it('throws NotFoundError when the pull does not exist, and never calls repoIntel', async () => {
    const getBlastRadius = vi.fn(async () => EMPTY_RESULT);
    const container = buildContainer(getBlastRadius);
    const svc = new BlastService(container);
    patchRepo(svc, { pull: undefined });

    await expect(svc.getBlastRadius('w1', 'missing-pr')).rejects.toBeInstanceOf(NotFoundError);
    expect(getBlastRadius).not.toHaveBeenCalled();
  });

  it('resolves the pull workspace-scoped, then calls repoIntel exactly once with (pull.repoId, changed file paths)', async () => {
    const getBlastRadius = vi.fn(async () => EMPTY_RESULT);
    const container = buildContainer(getBlastRadius);
    const svc = new BlastService(container);
    const pull: BlastPull = { id: 'pr-1', repoId: 'repo-1' };
    const changedFiles = ['src/billing.ts', 'src/webhook.ts'];
    const { getPullCalls } = patchRepo(svc, { pull, changedFiles });

    await svc.getBlastRadius('workspace-1', 'pr-1');

    expect(getPullCalls).toEqual([['workspace-1', 'pr-1']]);
    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith('repo-1', changedFiles);
  });
});
