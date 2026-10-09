import { and, desc, eq, gte } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AlertEventRow } from '../../db/rows.js';

/**
 * Alerts data-access. Owns `alert_events`. Every query is workspace-scoped.
 */
export type { AlertEventRow };

export interface NewAlertEvent {
  ruleId: string;
  severity: string;
  message: string;
}

export class AlertsRepository {
  constructor(private readonly db: Db) {}

  async listRecent(workspaceId: string, since: Date, limit: number): Promise<AlertEventRow[]> {
    return this.db
      .select()
      .from(t.alertEvents)
      .where(and(eq(t.alertEvents.workspaceId, workspaceId), gte(t.alertEvents.createdAt, since)))
      .orderBy(desc(t.alertEvents.createdAt))
      .limit(limit);
  }

  async recordEvent(workspaceId: string, event: NewAlertEvent): Promise<AlertEventRow> {
    const [row] = await this.db
      .insert(t.alertEvents)
      .values({ workspaceId, ruleId: event.ruleId, severity: event.severity, message: event.message })
      .returning();
    return row!;
  }

  async markDelivered(workspaceId: string, eventId: string, at: Date): Promise<void> {
    await this.db
      .update(t.alertEvents)
      .set({ deliveredAt: at })
      .where(and(eq(t.alertEvents.workspaceId, workspaceId), eq(t.alertEvents.id, eventId)));
  }
}
