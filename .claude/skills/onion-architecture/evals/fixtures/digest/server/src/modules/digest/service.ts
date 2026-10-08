import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';
import { DigestRepository } from './repository.js';
import { groupByDay, toDigestEntry } from './helpers.js';
import { DIGEST_MAX_ITEMS, DIGEST_WINDOW_DAYS, ONE_DAY_MS } from './constants.js';

/**
 * Digest service. Weekly roll-up of recently opened PRs plus a live open-PR
 * count straight from GitHub.
 */
export class DigestService {
  private readonly repo: DigestRepository;

  constructor(private readonly container: Container) {
    this.repo = new DigestRepository(container.db);
  }

  async weekly(workspaceId: string) {
    const since = new Date(Date.now() - DIGEST_WINDOW_DAYS * ONE_DAY_MS);
    const rows = await this.repo.listRecentPulls(workspaceId, since, DIGEST_MAX_ITEMS);
    return groupByDay(rows.map(toDigestEntry));
  }

  async liveOpenCount(owner: string, name: string): Promise<{ open: number }> {
    const token = await this.container.secrets.get('GITHUB_TOKEN');
    if (!token) throw new NotFoundError('No GitHub token configured');
    const github = new OctokitGitHubClient(token);
    const prs = await github.listPullRequests({ owner, name });
    return { open: prs.filter((pr) => pr.state === 'open').length };
  }
}
