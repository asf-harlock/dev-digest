import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Pulls data-access for PR Context (SPEC-07). The existing PR list / detail
 * handlers still query `container.db` directly (known ORM debt); only the new
 * Context-tab routes go through here. Every query is scoped by `workspaceId`.
 */

export type PullRow = typeof t.pullRequests.$inferSelect;
export type PullRepoRow = typeof t.repos.$inferSelect;

export class PullsRepository {
  constructor(private db: Db) {}

  /** The PR and its repo, both scoped to the workspace; undefined when either is missing. */
  async getPullWithRepo(
    workspaceId: string,
    prId: string,
  ): Promise<{ pr: PullRow; repo: PullRepoRow } | undefined> {
    const [pr] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!pr) return undefined;
    const [repo] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, pr.repoId)));
    return repo ? { pr, repo } : undefined;
  }

  /** The PR's changed files with their change status (`pr_files`). */
  async changedFiles(prId: string): Promise<{ path: string; status: string }[]> {
    return this.db
      .select({ path: t.prFiles.path, status: t.prFiles.status })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  /** Last completed save wins (EC-16): replaces the ordered list. Writes nothing else. */
  async setContextPaths(workspaceId: string, prId: string, paths: string[]): Promise<void> {
    await this.db
      .update(t.pullRequests)
      .set({ contextPaths: paths })
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  }

  /** AC-9: true when an enabled agent of the workspace uses the map-reduce strategy. */
  async hasEnabledMapReduceAgent(workspaceId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agents.enabled, true),
          eq(t.agents.strategy, 'map-reduce'),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
