import { and, eq, inArray } from 'drizzle-orm';
import { FeatureModelChoice, type FeatureModelId } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Onboarding tour persistence. `onboarding` has no `workspace_id` of its own,
 * so every read and write is joined through `repos.workspace_id`.
 */

export type TourRepoRow = typeof t.repos.$inferSelect;
export interface StoredTourRow {
  json: unknown;
  generatedAt: Date;
}

export class OnboardingTourRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, id: string): Promise<TourRepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row;
  }

  async getStored(workspaceId: string, repoId: string): Promise<StoredTourRow | undefined> {
    const [row] = await this.db
      .select({ json: t.onboarding.json, generatedAt: t.onboarding.generatedAt })
      .from(t.onboarding)
      .innerJoin(t.repos, eq(t.onboarding.repoId, t.repos.id))
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.onboarding.repoId, repoId)));
    return row;
  }

  /**
   * The workspace's model override for a feature, or `undefined`. Reads
   * `settings` directly: modules may not import each other
   * (`no-cross-module-import`), the same escape hatch conventions uses.
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
   * Stored PageRank (`file_rank.rank`) for the given files. Read-only and
   * scoped through the workspace's repo. Not `percentile`: that collapses
   * distinct ranks into ties (AC-10).
   */
  async getRanks(workspaceId: string, repoId: string, paths: string[]): Promise<Map<string, number>> {
    if (paths.length === 0 || !(await this.getRepo(workspaceId, repoId))) return new Map();
    const rows = await this.db
      .select({ path: t.fileRank.filePath, rank: t.fileRank.rank })
      .from(t.fileRank)
      .where(and(eq(t.fileRank.repoId, repoId), inArray(t.fileRank.filePath, paths)));
    return new Map(rows.map((r) => [r.path, r.rank]));
  }

  /** Insert or replace the repo's single tour. Returns false when the repo is not in the workspace. */
  async upsert(workspaceId: string, repoId: string, json: unknown, generatedAt: Date): Promise<boolean> {
    if (!(await this.getRepo(workspaceId, repoId))) return false;
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json, generatedAt })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json, generatedAt } });
    return true;
  }
}
