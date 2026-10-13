import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type {
  CiFailOn,
  CiFailureReason,
  CiInstallationStatus,
  CiRunStatus,
  CiTarget,
} from '@devdigest/shared';

/**
 * CI data-access (SPEC-12). Owns `ci_installations` and `ci_runs`, reads the
 * agent / skill / memory / repo rows the export needs (`modules/ci` may not
 * import another module, so it reads their tables here), and writes the
 * CI-sourced `agent_runs` row. SQL only — no HTTP, no business rules. Every
 * query is scoped by `workspaceId` (NFR-1); callers take it from `getContext()`.
 */

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;
export type CiRunRow = typeof t.ciRuns.$inferSelect;
export type { AgentRow };

/** Postgres unique_violation. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505';
}

/** `ORDER BY <col> DESC NULLS LAST` — a running run without a start time sorts last. */
const descNullsLast = (col: Parameters<typeof sql>[1]) => sql`${col} desc nulls last`;

// ---------------------------------------------------------------- read models

export interface CiRepoRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

export interface CiSkillRow {
  id: string;
  name: string;
  body: string;
  version: number;
}

export interface CiMemoryRow {
  id: string;
  kind: string;
  content: string;
  confidence: number | null;
  createdAt: Date;
}

export interface CiInstallationWithAgent {
  installation: CiInstallationRow;
  agentName: string;
  /** The agent's CURRENT version (compare with `installation.agentVersion`). */
  agentVersion: number;
}

export interface CiLastRun {
  installationId: string;
  status: CiRunStatus;
  ranAt: Date | null;
}

// ---------------------------------------------------------------- write models

export interface UpsertInstallationInput {
  workspaceId: string;
  agentId: string;
  repo: string;
  targetType: CiTarget;
  status: CiInstallationStatus;
  prUrl: string | null;
  workflowVersion: number;
  agentVersion: number;
  postAs: 'github_review' | 'pr_comment' | 'none';
  triggers: string[];
  ciFailOn: CiFailOn;
  manifestSlug: string;
}

/** `repo_taken`: another agent already owns the repository's installation (`ci_repo_taken`). */
export type UpsertInstallationResult =
  | { kind: 'saved'; installation: CiInstallationRow }
  | { kind: 'repo_taken'; installation: CiInstallationRow; agentName: string };

export interface UpsertRunInput {
  workspaceId: string;
  ciInstallationId: string | null;
  repo: string;
  agentName: string;
  prNumber: number | null;
  ranAt: Date | null;
  githubRunId: number;
  runAttempt: number;
  headSha: string | null;
  status: CiRunStatus;
  verdict: 'request_changes' | 'approve' | 'comment' | null;
  failureReason: CiFailureReason | null;
  findingsCount: number | null;
  critical: number | null;
  warning: number | null;
  suggestion: number | null;
  costUsd: number | null;
  durationMs: number | null;
  githubUrl: string | null;
}

export interface InsertAgentRunInput {
  workspaceId: string;
  ciRunId: string;
  agentId: string;
  status: 'done' | 'failed';
  ranAt: Date;
  costUsd: number | null;
  durationMs: number | null;
  findingsCount: number | null;
  blockers: number | null;
  /** The failure reason code when `status='failed'`. */
  error: string | null;
}

export interface ListRunsFilter {
  repo?: string;
  agentId?: string;
  status?: CiRunStatus;
  installationId?: string;
  limit?: number;
}

/** Hard ceiling of `listRuns` (spec: ≤200). */
const MAX_LIST_RUNS = 200;

export class CiRepository {
  constructor(private db: Db) {}

  // ------------------------------------------------------------ export inputs

  /** The workspace's repo, matched case-insensitively on `full_name` (UI-4). */
  async findRepoByFullName(workspaceId: string, fullName: string): Promise<CiRepoRow | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.repos)
      .where(
        and(
          eq(t.repos.workspaceId, workspaceId),
          sql`lower(${t.repos.fullName}) = lower(${fullName})`,
        ),
      )
      .limit(1);
    return row;
  }

  async getAgent(workspaceId: string, agentId: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)))
      .limit(1);
    return row;
  }

  /** Skills of an agent in link order; the link AND the skill must be enabled (EC-14). */
  async enabledSkillsInLinkOrder(workspaceId: string, agentId: string): Promise<CiSkillRow[]> {
    return this.db
      .select({
        id: t.skills.id,
        name: t.skills.name,
        body: t.skills.body,
        version: t.skills.version,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order), asc(t.skills.name));
  }

  /** Newest repo-scoped memory entries, at most `limit`; id breaks ties (deterministic, UI-5). */
  async repoMemoryRows(workspaceId: string, repoId: string, limit: number): Promise<CiMemoryRow[]> {
    return this.db
      .select({
        id: t.memory.id,
        kind: t.memory.kind,
        content: t.memory.content,
        confidence: t.memory.confidence,
        createdAt: t.memory.createdAt,
      })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          eq(t.memory.repoId, repoId),
          eq(t.memory.scope, 'repo'),
        ),
      )
      .orderBy(desc(t.memory.createdAt), desc(t.memory.id))
      .limit(limit);
  }

  /** How many repo-scoped memory entries exist (drives the `memory_truncated` warning). */
  async countRepoMemory(workspaceId: string, repoId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(t.memory)
      .where(
        and(
          eq(t.memory.workspaceId, workspaceId),
          eq(t.memory.repoId, repoId),
          eq(t.memory.scope, 'repo'),
        ),
      );
    return row?.count ?? 0;
  }

  // ------------------------------------------------------------ installations

  async listInstallationsByAgent(
    workspaceId: string,
    agentId: string,
  ): Promise<CiInstallationWithAgent[]> {
    return this.selectInstallations(
      and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)),
    );
  }

  async listInstallations(workspaceId: string): Promise<CiInstallationWithAgent[]> {
    return this.selectInstallations(eq(t.ciInstallations.workspaceId, workspaceId));
  }

  async getInstallation(
    workspaceId: string,
    id: string,
  ): Promise<CiInstallationWithAgent | undefined> {
    const rows = await this.selectInstallations(
      and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.id, id)),
    );
    return rows[0];
  }

  /** The installation of a repository (case-insensitive), whichever agent owns it. */
  async findInstallationByRepo(
    workspaceId: string,
    repo: string,
  ): Promise<CiInstallationWithAgent | undefined> {
    const rows = await this.selectInstallations(
      and(
        eq(t.ciInstallations.workspaceId, workspaceId),
        sql`lower(${t.ciInstallations.repo}) = lower(${repo})`,
      ),
    );
    return rows[0];
  }

  private async selectInstallations(
    where: ReturnType<typeof and>,
  ): Promise<CiInstallationWithAgent[]> {
    const rows = await this.db
      .select({
        installation: t.ciInstallations,
        agentName: t.agents.name,
        agentVersion: t.agents.version,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(where)
      .orderBy(desc(t.ciInstallations.installedAt), asc(t.ciInstallations.id));
    return rows;
  }

  /**
   * Create the installation of a repository, or update it when the SAME agent
   * already owns it (re-export / Update CI config). A different agent owning it
   * yields `repo_taken` and changes nothing. An `active` installation is never
   * demoted to `pending_pr`/`manual`. The unique index
   * `(workspace_id, lower(repo))` settles a concurrent insert race.
   */
  async upsertInstallation(input: UpsertInstallationInput): Promise<UpsertInstallationResult> {
    const existing = await this.findInstallationByRepo(input.workspaceId, input.repo);
    if (existing) return this.updateOrTaken(existing, input);

    try {
      const [row] = await this.db
        .insert(t.ciInstallations)
        .values({
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          repo: input.repo,
          targetType: input.targetType,
          status: input.status,
          prUrl: input.prUrl,
          workflowVersion: input.workflowVersion,
          agentVersion: input.agentVersion,
          postAs: input.postAs,
          triggers: input.triggers,
          ciFailOn: input.ciFailOn,
          manifestSlug: input.manifestSlug,
        })
        .returning();
      return { kind: 'saved', installation: row! };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await this.findInstallationByRepo(input.workspaceId, input.repo);
      if (!raced) throw err;
      return this.updateOrTaken(raced, input);
    }
  }

  private async updateOrTaken(
    existing: CiInstallationWithAgent,
    input: UpsertInstallationInput,
  ): Promise<UpsertInstallationResult> {
    if (existing.installation.agentId !== input.agentId) {
      return { kind: 'repo_taken', installation: existing.installation, agentName: existing.agentName };
    }
    const [row] = await this.db
      .update(t.ciInstallations)
      .set({
        targetType: input.targetType,
        status: existing.installation.status === 'active' ? 'active' : input.status,
        prUrl: input.prUrl,
        workflowVersion: input.workflowVersion,
        agentVersion: input.agentVersion,
        postAs: input.postAs,
        triggers: input.triggers,
        ciFailOn: input.ciFailOn,
      })
      .where(
        and(
          eq(t.ciInstallations.workspaceId, input.workspaceId),
          eq(t.ciInstallations.id, existing.installation.id),
        ),
      )
      .returning();
    return { kind: 'saved', installation: row! };
  }

  async touchLastRefreshed(workspaceId: string, installationId: string, at: Date): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ lastRefreshedAt: at })
      .where(
        and(eq(t.ciInstallations.workspaceId, workspaceId), eq(t.ciInstallations.id, installationId)),
      );
  }

  /** First ingested run of a workflow proves it is live: `pending_pr`/`manual` -> `active`. */
  async markActiveOnFirstRun(workspaceId: string, installationId: string): Promise<void> {
    await this.db
      .update(t.ciInstallations)
      .set({ status: 'active' })
      .where(
        and(
          eq(t.ciInstallations.workspaceId, workspaceId),
          eq(t.ciInstallations.id, installationId),
          inArray(t.ciInstallations.status, ['pending_pr', 'manual']),
        ),
      );
  }

  // ------------------------------------------------------------------- runs

  async findRunByGithubId(
    workspaceId: string,
    githubRunId: number,
    runAttempt: number,
  ): Promise<CiRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          eq(t.ciRuns.githubRunId, githubRunId),
          eq(t.ciRuns.runAttempt, runAttempt),
        ),
      )
      .limit(1);
    return row;
  }

  /** Record an in-progress run; an already-stored `running` row is refreshed, a completed one is untouched. */
  async upsertRunning(input: UpsertRunInput): Promise<CiRunRow | undefined> {
    return this.upsertRun(input);
  }

  /**
   * Store the final state of a run: replaces its `running` row, or inserts when it
   * was never seen running. A row that is already completed is left as is (AC-61)
   * — the result is `undefined` then.
   */
  async saveCompletedRun(input: UpsertRunInput): Promise<CiRunRow | undefined> {
    return this.upsertRun(input);
  }

  private async upsertRun(
    input: UpsertRunInput,
    exec: Pick<Db, 'insert'> = this.db,
  ): Promise<CiRunRow | undefined> {
    const values = {
      workspaceId: input.workspaceId,
      ciInstallationId: input.ciInstallationId,
      repo: input.repo,
      agentName: input.agentName,
      prNumber: input.prNumber,
      ranAt: input.ranAt,
      githubRunId: input.githubRunId,
      runAttempt: input.runAttempt,
      headSha: input.headSha,
      status: input.status,
      verdict: input.verdict,
      failureReason: input.failureReason,
      findingsCount: input.findingsCount,
      critical: input.critical,
      warning: input.warning,
      suggestion: input.suggestion,
      costUsd: input.costUsd,
      durationMs: input.durationMs,
      githubUrl: input.githubUrl,
      source: 'github_actions',
    };
    const { workspaceId: _ws, githubRunId: _id, runAttempt: _attempt, ...updatable } = values;
    const [row] = await exec
      .insert(t.ciRuns)
      .values(values)
      .onConflictDoUpdate({
        target: [t.ciRuns.workspaceId, t.ciRuns.githubRunId, t.ciRuns.runAttempt],
        set: { ...updatable, ingestedAt: sql`now()` },
        setWhere: eq(t.ciRuns.status, 'running'),
      })
      .returning();
    return row;
  }

  /**
   * ONE transaction: insert the CI-sourced `agent_runs` row (`source='ci'`,
   * no PR) and point `ci_runs.agent_run_id` at it (AC-60). Returns the new id.
   */
  async insertAgentRunAndLink(input: InsertAgentRunInput): Promise<string> {
    return this.db.transaction((tx) => this.insertAgentRunAndLinkIn(tx, input));
  }

  /**
   * Store a completed run AND its `agent_runs` row in ONE transaction (AC-60): a
   * crash can never leave a completed `ci_runs` row without its agent run. A row
   * that is already completed is left untouched and no agent run is written
   * (AC-61); the result is `undefined` then.
   */
  async saveCompletedRunWithAgentRun(
    run: UpsertRunInput,
    agentRun: Omit<InsertAgentRunInput, 'ciRunId'>,
  ): Promise<CiRunRow | undefined> {
    return this.db.transaction(async (tx) => {
      const saved = await this.upsertRun(run, tx);
      if (!saved) return undefined;
      await this.insertAgentRunAndLinkIn(tx, { ...agentRun, ciRunId: saved.id });
      return saved;
    });
  }

  private async insertAgentRunAndLinkIn(
    tx: Pick<Db, 'insert' | 'update'>,
    input: InsertAgentRunInput,
  ): Promise<string> {
    const [run] = await tx
      .insert(t.agentRuns)
      .values({
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        prId: null,
        ranAt: input.ranAt,
        source: 'ci',
        status: input.status,
        costUsd: input.costUsd,
        durationMs: input.durationMs,
        findingsCount: input.findingsCount,
        blockers: input.blockers,
        error: input.error,
      })
      .returning({ id: t.agentRuns.id });
    const agentRunId = run!.id;
    await tx
      .update(t.ciRuns)
      .set({ agentRunId })
      .where(and(eq(t.ciRuns.workspaceId, input.workspaceId), eq(t.ciRuns.id, input.ciRunId)));
    return agentRunId;
  }

  /** Mark `running` rows older than `olderThan` as `failed` / `stale` (EC-28); returns how many. */
  async failStaleRunning(workspaceId: string, olderThan: Date): Promise<number> {
    const rows = await this.db
      .update(t.ciRuns)
      .set({ status: 'failed', failureReason: 'stale' })
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          eq(t.ciRuns.status, 'running'),
          // Drizzle operators (not a raw `sql` template) so the Date is mapped to a timestamp param.
          or(
            lt(t.ciRuns.ranAt, olderThan),
            and(isNull(t.ciRuns.ranAt), lt(t.ciRuns.ingestedAt, olderThan)),
          ),
        ),
      )
      .returning({ id: t.ciRuns.id });
    return rows.length;
  }

  /** Stored rows only, newest first (AC-63); every filter optional, `limit` clamped to 1..200. */
  async listRuns(workspaceId: string, filter: ListRunsFilter = {}): Promise<CiRunRow[]> {
    const conds = [eq(t.ciRuns.workspaceId, workspaceId)];
    if (filter.repo) conds.push(sql`lower(${t.ciRuns.repo}) = lower(${filter.repo})`);
    if (filter.status) conds.push(eq(t.ciRuns.status, filter.status));
    if (filter.installationId) conds.push(eq(t.ciRuns.ciInstallationId, filter.installationId));
    if (filter.agentId) {
      conds.push(
        inArray(
          t.ciRuns.ciInstallationId,
          this.db
            .select({ id: t.ciInstallations.id })
            .from(t.ciInstallations)
            .where(
              and(
                eq(t.ciInstallations.workspaceId, workspaceId),
                eq(t.ciInstallations.agentId, filter.agentId),
              ),
            ),
        ),
      );
    }
    const limit = Math.min(Math.max(Math.trunc(filter.limit ?? MAX_LIST_RUNS), 1), MAX_LIST_RUNS);
    return this.db
      .select()
      .from(t.ciRuns)
      .where(and(...conds))
      .orderBy(descNullsLast(t.ciRuns.ranAt), desc(t.ciRuns.id))
      .limit(limit);
  }

  /** The newest stored run of each given installation (installations without runs are absent). */
  async lastRunPerInstallation(
    workspaceId: string,
    installationIds: string[],
  ): Promise<CiLastRun[]> {
    if (installationIds.length === 0) return [];
    const rows = await this.db
      .selectDistinctOn([t.ciRuns.ciInstallationId], {
        installationId: t.ciRuns.ciInstallationId,
        status: t.ciRuns.status,
        ranAt: t.ciRuns.ranAt,
      })
      .from(t.ciRuns)
      .where(
        and(
          eq(t.ciRuns.workspaceId, workspaceId),
          inArray(t.ciRuns.ciInstallationId, installationIds),
        ),
      )
      .orderBy(t.ciRuns.ciInstallationId, descNullsLast(t.ciRuns.ranAt), desc(t.ciRuns.id));
    return rows.flatMap((r) =>
      r.installationId ? [{ installationId: r.installationId, status: r.status, ranAt: r.ranAt }] : [],
    );
  }
}
