import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Project Context data-access. Reads `repos` (to find the clone) and the
 * attachment columns on `agents` / `skills` / `agent_skills` (for `used_by`).
 * Every query is scoped by `workspaceId`. Nothing is written here — the
 * attachment lists are saved by the agents and skills modules.
 */

export type ContextRepoRow = typeof t.repos.$inferSelect;

export class ContextRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, id: string): Promise<ContextRepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, id)));
    return row;
  }

  /** Every agent's own attached paths in the workspace. */
  async agentAttachments(
    workspaceId: string,
  ): Promise<{ id: string; contextPaths: string[] }[]> {
    return this.db
      .select({ id: t.agents.id, contextPaths: t.agents.contextPaths })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
  }

  /**
   * Skill attachments reachable by an agent: the link AND the skill are both
   * enabled (the same gate `enabledSkillsForPrompt` applies).
   */
  async enabledSkillAttachments(
    workspaceId: string,
  ): Promise<{ agentId: string; contextPaths: string[] }[]> {
    return this.db
      .select({ agentId: t.agentSkills.agentId, contextPaths: t.skills.contextPaths })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      );
  }
}
