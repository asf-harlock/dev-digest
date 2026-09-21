import { and, eq, inArray } from 'drizzle-orm';
import {
  FeatureModelChoice,
  type ConventionCategory,
  type ConventionExtractionMode,
  type ConventionStatus,
  type FeatureModelId,
  type Provider,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, RepoConventionScanRow } from '../../db/rows.js';

/**
 * Conventions data-access. Owns `conventions` and `repo_convention_scans`, plus
 * a narrow read into `repos` for the clone path. Every query is workspace-scoped.
 */
export type { ConventionRow, RepoConventionScanRow };

export interface RepoClone {
  clonePath: string | null;
  fullName: string;
}

export interface NewScan {
  sampleFileCount: number;
  configFileCount: number;
  mode: ConventionExtractionMode;
  // null when `mode: 'local'` — no model call was made.
  provider: Provider | null;
  model: string | null;
}

export interface NewCandidate {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export interface UpdateConventionPatch {
  category?: ConventionCategory;
  rule?: string;
  evidencePath?: string;
  evidenceStartLine?: number;
  evidenceEndLine?: number;
  evidenceSnippet?: string;
  status?: ConventionStatus;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Resolve a workspace-scoped repo's clone path + full name. `null` = repo not found. */
  async getRepoClonePath(workspaceId: string, repoId: string): Promise<RepoClone | null> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath, fullName: t.repos.fullName })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  /**
   * The workspace's override for a feature-model choice, or `undefined` when
   * unset/invalid. This reads `settings` directly rather than importing
   * `modules/settings/feature-models.ts` — modules may not import each other
   * (`no-cross-module-import`); a repository reading another module's table
   * directly is the established escape hatch (`SkillsRepository` already joins
   * `agents`/`agent_runs`/`findings` the same way).
   */
  async getFeatureModelOverride(
    workspaceId: string,
    id: FeatureModelId,
  ): Promise<FeatureModelChoice | undefined> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    const settingsMap: Record<string, unknown> = {};
    for (const r of rows) settingsMap[r.key] = r.value;
    const featureModels = settingsMap.feature_models as Record<string, unknown> | undefined;
    const parsed = FeatureModelChoice.safeParse(featureModels?.[id]);
    return parsed.success ? parsed.data : undefined;
  }

  /**
   * Replace every existing candidate + scan for `repoId` with a fresh batch, in
   * one transaction. Deleting the scan rows cascades into `conventions` (FK
   * `scan_id ... onDelete: cascade`), so this is the entire "re-scan replaces
   * everything" behavior.
   */
  async replaceAll(
    workspaceId: string,
    repoId: string,
    scan: NewScan,
    candidates: NewCandidate[],
  ): Promise<{ scan: RepoConventionScanRow; rows: ConventionRow[] }> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.repoConventionScans)
        .where(
          and(
            eq(t.repoConventionScans.workspaceId, workspaceId),
            eq(t.repoConventionScans.repoId, repoId),
          ),
        );

      const [scanRow] = await tx
        .insert(t.repoConventionScans)
        .values({
          workspaceId,
          repoId,
          sampleFileCount: scan.sampleFileCount,
          configFileCount: scan.configFileCount,
          candidateCount: candidates.length,
          mode: scan.mode,
          provider: scan.provider,
          model: scan.model,
        })
        .returning();

      const rows =
        candidates.length === 0
          ? []
          : await tx
              .insert(t.conventions)
              .values(
                candidates.map((c) => ({
                  workspaceId,
                  repoId,
                  scanId: scanRow!.id,
                  category: c.category,
                  rule: c.rule,
                  evidencePath: c.evidencePath,
                  evidenceStartLine: c.evidenceStartLine,
                  evidenceEndLine: c.evidenceEndLine,
                  evidenceSnippet: c.evidenceSnippet,
                  confidence: c.confidence,
                })),
              )
              .returning();

      return { scan: scanRow!, rows };
    });
  }

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  async getLatestScan(workspaceId: string, repoId: string): Promise<RepoConventionScanRow | null> {
    const [row] = await this.db
      .select()
      .from(t.repoConventionScans)
      .where(
        and(
          eq(t.repoConventionScans.workspaceId, workspaceId),
          eq(t.repoConventionScans.repoId, repoId),
        ),
      );
    return row ?? null;
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async listByIds(workspaceId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConventionPatch,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
        ...(patch.evidencePath !== undefined ? { evidencePath: patch.evidencePath } : {}),
        ...(patch.evidenceStartLine !== undefined
          ? { evidenceStartLine: patch.evidenceStartLine }
          : {}),
        ...(patch.evidenceEndLine !== undefined ? { evidenceEndLine: patch.evidenceEndLine } : {}),
        ...(patch.evidenceSnippet !== undefined ? { evidenceSnippet: patch.evidenceSnippet } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
