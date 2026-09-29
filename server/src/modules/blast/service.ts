import type { BlastRadius } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { PULL_NOT_FOUND } from './constants.js';
import { toBlastRadius } from './helpers.js';
import { BlastRepository } from './repository.js';

/**
 * Blast service — the impact map for a PR's changed files. Orchestration
 * only: resolve the PR (workspace-scoped) → its changed files → exactly one
 * `repoIntel.getBlastRadius` call → map to the `BlastRadius` contract.
 *
 * `repo-intel` never throws (it degrades via `BlastRadius.degraded`/`reason`
 * instead) — this method does not wrap that call in try/catch.
 */
export class BlastService {
  private repo: BlastRepository;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
  }

  async getBlastRadius(workspaceId: string, prId: string): Promise<BlastRadius> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError(PULL_NOT_FOUND);

    const changedFiles = await this.repo.getChangedFiles(workspaceId, pull.id);
    const result = await this.container.repoIntel.getBlastRadius(pull.repoId, changedFiles);
    return toBlastRadius(result);
  }
}
