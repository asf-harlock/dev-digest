import { and, desc, eq, gte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';

/**
 * Digest data-access. Reads `pull_requests` for the weekly digest.
 * Every query is workspace-scoped.
 */
export type { PullRow };

export class DigestRepository {
  constructor(private readonly db: Db) {}

  async listRecentPulls(workspaceId: string, since: Date, limit: number): Promise<PullRow[]> {
    return this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), gte(t.pullRequests.openedAt, since)))
      .orderBy(desc(t.pullRequests.openedAt))
      .limit(limit);
  }
}
