import { desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ReviewRow } from '../../db/rows.js';

/**
 * Run-export data-access. Saved export presets live in `export_presets`;
 * reviews are read through `reviews`. Every query is workspace-scoped.
 */
export type { ReviewRow };

export class RunExportRepository {
  constructor(private readonly db: Db) {}

  async listReviews(workspaceId: string, limit: number): Promise<ReviewRow[]> {
    return this.db
      .select()
      .from(t.reviews)
      .where(eq(t.reviews.workspaceId, workspaceId))
      .orderBy(desc(t.reviews.createdAt))
      .limit(limit);
  }

  async insertPreset(workspaceId: string, name: string, format: string) {
    const [row] = await this.db
      .insert(t.exportPresets)
      .values({ workspaceId, name, format })
      .returning();
    return row!;
  }
}
