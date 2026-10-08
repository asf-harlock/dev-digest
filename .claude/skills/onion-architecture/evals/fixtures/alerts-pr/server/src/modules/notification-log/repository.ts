import { and, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { NotificationLogRow, FindingRow } from '../../db/rows.js';
import { ConflictError } from '../../platform/errors.js';

/**
 * Notification-log data-access. Owns `notification_log`; reads `findings`
 * through `reviews` so every read reaches `workspace_id`.
 */
export type { NotificationLogRow };

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === UNIQUE_VIOLATION;
}

export class NotificationLogRepository {
  constructor(private readonly db: Db) {}

  async page(workspaceId: string, before: Date | undefined, limit: number): Promise<NotificationLogRow[]> {
    const scope = before
      ? and(eq(t.notificationLog.workspaceId, workspaceId), lt(t.notificationLog.sentAt, before))
      : eq(t.notificationLog.workspaceId, workspaceId);
    return this.db.select().from(t.notificationLog).where(scope).orderBy(desc(t.notificationLog.sentAt)).limit(limit);
  }

  async append(workspaceId: string, dedupeKey: string, channel: string, findingId: string): Promise<NotificationLogRow> {
    try {
      const [row] = await this.db
        .insert(t.notificationLog)
        .values({ workspaceId, dedupeKey, channel, findingId })
        .returning();
      return row!;
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError(`Notification "${dedupeKey}" was already sent`);
      throw err;
    }
  }

  async findingsForReview(workspaceId: string, reviewId: string): Promise<FindingRow[]> {
    const rows = await this.db
      .select({ finding: t.findings })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.reviews.id, t.findings.reviewId))
      .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.findings.reviewId, reviewId)));
    return rows.map((r) => r.finding);
  }
}
