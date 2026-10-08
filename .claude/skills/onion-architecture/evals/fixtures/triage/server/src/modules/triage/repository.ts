import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { FindingRow } from '../../db/rows.js';

/**
 * Triage data-access. Owns accept / dismiss state on `findings`.
 */
export type { FindingRow };

export class TriageRepository {
  constructor(private readonly db: Db) {}

  async getFinding(findingId: string): Promise<FindingRow | undefined> {
    const [row] = await this.db.select().from(t.findings).where(eq(t.findings.id, findingId)).limit(1);
    return row;
  }

  async markAccepted(findingId: string, at: Date): Promise<void> {
    await this.db.update(t.findings).set({ acceptedAt: at, dismissedAt: null }).where(eq(t.findings.id, findingId));
  }

  async markDismissed(findingId: string, at: Date): Promise<void> {
    await this.db.update(t.findings).set({ dismissedAt: at, acceptedAt: null }).where(eq(t.findings.id, findingId));
  }

  async listOpenForReview(workspaceId: string, reviewId: string): Promise<FindingRow[]> {
    const rows = await this.db
      .select({ finding: t.findings })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.findings.reviewId, reviewId)));
    return rows.map((r) => r.finding).filter((f) => !f.acceptedAt && !f.dismissedAt);
  }

  async listByIds(ids: string[]): Promise<FindingRow[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(t.findings).where(inArray(t.findings.id, ids));
  }
}
