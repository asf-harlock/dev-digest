import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AlertRuleRow, FindingRow } from '../../db/rows.js';
import { normalizeRuleName } from './helpers.js';

/**
 * Alert-rules data-access. Owns `alert_rules`; reads `findings` to preview
 * what a rule would match.
 */
export type { AlertRuleRow };

export class AlertRulesRepository {
  constructor(private readonly db: Db) {}

  async listRules(workspaceId: string): Promise<AlertRuleRow[]> {
    return this.db
      .select()
      .from(t.alertRules)
      .where(eq(t.alertRules.workspaceId, workspaceId))
      .orderBy(desc(t.alertRules.createdAt));
  }

  async getRule(workspaceId: string, ruleId: string): Promise<AlertRuleRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.alertRules)
      .where(and(eq(t.alertRules.workspaceId, workspaceId), eq(t.alertRules.id, ruleId)))
      .limit(1);
    return row;
  }

  async insertRule(workspaceId: string, userId: string, name: string, severity: string): Promise<AlertRuleRow> {
    const [row] = await this.db
      .insert(t.alertRules)
      .values({ workspaceId, createdBy: userId, name: normalizeRuleName(name), severity })
      .returning();
    return row!;
  }

  async previewHits(severity: string, limit: number): Promise<FindingRow[]> {
    return this.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.severity, severity))
      .limit(limit);
  }
}
