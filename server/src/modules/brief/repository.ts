import { and, eq, sql } from 'drizzle-orm';
import { FeatureModelChoice, type FeatureModelId } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** The slice of a PR the brief needs. */
export interface BriefPull {
  id: string;
  repoId: string;
  title: string;
  body: string | null;
  headSha: string;
}

export interface BriefFileRow {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

/**
 * PR brief persistence. `pr_brief` has no `workspace_id` of its own, so every
 * read and write is joined through `pull_requests.workspace_id` (NFR-4).
 */
export class BriefRepository {
  constructor(private db: Db) {}

  async getPull(workspaceId: string, prId: string): Promise<BriefPull | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        title: t.pullRequests.title,
        body: t.pullRequests.body,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /** Changed files with their patches, scoped through the PR's workspace. */
  async getFiles(workspaceId: string, prId: string): Promise<BriefFileRow[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
        patch: t.prFiles.patch,
      })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.prFiles.prId, prId)));
  }

  /** The stored document as-is (validated by the service), or `undefined` when there is no row. */
  async getStored(workspaceId: string, prId: string): Promise<unknown> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.prBrief.prId, prId)));
    return row?.json;
  }

  /**
   * The workspace's model override for a feature, or `undefined`. Reads
   * `settings` directly: modules may not import each other
   * (`no-cross-module-import`), the same escape hatch onboarding-tour uses.
   */
  async getFeatureModelOverride(workspaceId: string, id: FeatureModelId): Promise<FeatureModelChoice | undefined> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    const row = rows.find((r) => r.key === 'feature_models');
    const fm = row?.value as Record<string, unknown> | undefined;
    const parsed = FeatureModelChoice.safeParse(fm?.[id]);
    return parsed.success ? parsed.data : undefined;
  }

  /**
   * Atomic jsonb merge with upsert: `json = coalesce(json, '{}') || patch`. A
   * failure merges only the error fields and a success the full brief, so one
   * write can never clobber a field the other owns. The row is created from
   * the workspace-scoped PR, so a foreign PR id inserts nothing. Returns false
   * in that case.
   */
  async mergeEnvelope(workspaceId: string, prId: string, patch: Record<string, unknown>): Promise<boolean> {
    const patchJson = JSON.stringify(patch);
    const rows = await this.db.execute(sql`
      INSERT INTO pr_brief (pr_id, json)
      SELECT ${t.pullRequests.id}, ${patchJson}::jsonb
      FROM ${t.pullRequests}
      WHERE ${t.pullRequests.id} = ${prId} AND ${t.pullRequests.workspaceId} = ${workspaceId}
      ON CONFLICT (pr_id) DO UPDATE
        SET json = coalesce(${t.prBrief.json}, '{}'::jsonb) || excluded.json
      RETURNING pr_id
    `);
    return rows.length > 0;
  }
}
