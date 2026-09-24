import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { FeatureModelChoice, type FeatureModelId, type Intent } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

/**
 * The workspace's override for a feature-model choice, or `undefined` when
 * unset/invalid. Reads `settings` directly rather than importing
 * `modules/settings/feature-models.ts` — modules may not import each other
 * (`no-cross-module-import`, server/.dependency-cruiser.cjs); a repository
 * reading another module's table directly is the established escape hatch
 * (`ConventionsRepository.getFeatureModelOverride` does the identical thing;
 * `SkillsRepository` does it for `agents`/`findings`).
 */
export async function getFeatureModelOverride(
  db: Db,
  workspaceId: string,
  id: FeatureModelId,
): Promise<FeatureModelChoice | undefined> {
  const rows = await db
    .select({ key: t.settings.key, value: t.settings.value })
    .from(t.settings)
    .where(eq(t.settings.workspaceId, workspaceId));
  const settingsMap: Record<string, unknown> = {};
  for (const r of rows) settingsMap[r.key] = r.value;
  const featureModels = settingsMap.feature_models as Record<string, unknown> | undefined;
  const parsed = FeatureModelChoice.safeParse(featureModels?.[id]);
  return parsed.success ? parsed.data : undefined;
}

// ---- intent ---------------------------------------------------------------

/** Extra fields the classifier records alongside the base Intent (§5.1). Both
 *  optional so callers that only have a bare Intent (no run metadata) can
 *  still upsert — confidence/sources default via the Intent contract; the
 *  classified-at/sha pair stays null until a real classify call sets them. */
export interface UpsertIntentMeta {
  classifiedAt?: Date;
  classifiedForSha?: string;
}

export async function upsertIntent(
  db: Db,
  prId: string,
  intent: Intent,
  meta: UpsertIntentMeta = {},
): Promise<void> {
  const values = {
    prId,
    intent: intent.intent,
    inScope: intent.in_scope,
    outOfScope: intent.out_of_scope,
    confidence: intent.confidence,
    sources: intent.sources,
    classifiedAt: meta.classifiedAt ?? null,
    classifiedForSha: meta.classifiedForSha ?? null,
  };
  await db
    .insert(t.prIntent)
    .values(values)
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: {
        intent: values.intent,
        inScope: values.inScope,
        outOfScope: values.outOfScope,
        confidence: values.confidence,
        sources: values.sources,
        classifiedAt: values.classifiedAt,
        classifiedForSha: values.classifiedForSha,
      },
    });
}

export async function getIntent(
  db: Db,
  prId: string,
): Promise<(Intent & UpsertIntentMeta) | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: row.confidence as Intent['confidence'],
    sources: row.sources,
    classifiedAt: row.classifiedAt ?? undefined,
    classifiedForSha: row.classifiedForSha ?? undefined,
  };
}
