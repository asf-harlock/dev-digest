import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** The narrow slice of a PR this module needs — not the full `PullRow`. */
export interface BlastPull {
  id: string;
  repoId: string;
}

/**
 * Blast data-access. Read-only: a workspace-scoped PR lookup plus its changed
 * file paths. `pr_files` carries no `workspace_id` of its own
 * (`server/INSIGHTS.md` 2026-09-17) — always resolve the PR workspace-scoped
 * first, then read its files by `pr_id`.
 */
export class BlastRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<BlastPull | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /** Scoped through `pull_requests.workspace_id` itself, so a caller that skips
   *  `getPull` still cannot read another workspace's file list. */
  async getChangedFiles(workspaceId: string, prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.prFiles.prId, prId)));
    return rows.map((r) => r.path);
  }
}
