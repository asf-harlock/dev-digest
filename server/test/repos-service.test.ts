import { describe, it, expect } from 'vitest';
import { RepoService } from '../src/modules/repos/service.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { Container } from '../src/platform/container.js';
import type { RepoRow } from '../src/modules/repos/repository.js';

/**
 * Hermetic — no Postgres. `RepoService.lookupByFullName` (the `GET
 * /repos/lookup` handler's only dependency) is exercised against a
 * hand-written fake repository, the same "patch the private field" style as
 * `test/conventions-service.test.ts`.
 */

function buildContainer(): Container {
  return { db: {} as never } as unknown as Container;
}

function patchRepo(svc: RepoService, row: RepoRow | undefined): void {
  (svc as unknown as { repo: Record<string, unknown> }).repo = {
    findByFullName: async () => row,
  };
}

const ROW: RepoRow = {
  id: 'repo-1',
  workspaceId: 'ws-1',
  owner: 'acme',
  name: 'payments-api',
  fullName: 'acme/payments-api',
  defaultBranch: 'main',
  clonePath: null,
  lastPolledAt: null,
  createdBy: 'user-1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
} as RepoRow;

describe('RepoService.lookupByFullName', () => {
  it('returns {id, full_name, name} for an existing repo, not the full Repo DTO', async () => {
    const svc = new RepoService(buildContainer());
    patchRepo(svc, ROW);

    const result = await svc.lookupByFullName('ws-1', 'acme/payments-api');

    expect(result).toEqual({ id: 'repo-1', full_name: 'acme/payments-api', name: 'payments-api' });
  });

  it('throws NotFoundError when no repo matches', async () => {
    const svc = new RepoService(buildContainer());
    patchRepo(svc, undefined);

    await expect(svc.lookupByFullName('ws-1', 'acme/does-not-exist')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
