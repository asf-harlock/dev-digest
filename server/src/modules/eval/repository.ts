import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type {
  EvalCaseOutcome,
  EvalExpectation,
  EvalCaseMeta,
  EvalLift,
  EvalMetrics,
  EvalOwnerKind,
  EvalRunSnapshot,
  EvalSkillRunSnapshot,
  EvalCaseRef,
} from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalCaseRow, EvalRunRow } from '../../db/rows.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { EVAL_ERROR, EVAL_ERROR_MESSAGE, INTERRUPTED_REASON, NOT_FOUND } from './constants.js';
import { isUniqueViolation } from './helpers.js';
import type { CarrierLink } from './arms.js';
import type {
  CarrierRow,
  EvalRunSummary,
  EvalSkillRunSummary,
  EvalSkillTrendRow,
  FindingCaseContext,
  FrozenCase,
  SkillForRun,
} from './types.js';

/**
 * SPEC-08 eval data-access. Owns `eval_cases` and `eval_runs`, and reads the
 * `findings` / `reviews` / `pull_requests` / `repos` / `pr_files` rows needed
 * to create a case (read-only; this module never writes to them — NFR-4).
 * Every query is scoped by `workspace_id` (NFR-3); tables without the column
 * (`findings`, `pr_files`) are scoped through the parent that has one.
 *
 * List queries select scalar columns only — the `snapshot` / `case_set` /
 * `case_results` jsonb are read by detail and compare alone (NFR-13).
 */

export type { EvalCaseRow, EvalRunRow };

/** A drizzle transaction handle — what `Db.transaction` passes to its callback. */
export type DbTx = Parameters<Parameters<Db['transaction']>[0]>[0];

const FINISHED = ['completed', 'partial'] as const;

/**
 * Scalar run columns + jsonb lengths computed in SQL; mirrors `EvalRunSummary`.
 * `agent_id` / `agent_version` are nullable since skill runs exist (SPEC-09), but
 * every query using this selection filters `owner_kind = 'agent'` (NFR-5), so the
 * `sql<…>` casts state that invariant to the type system.
 */
const summarySelection = {
  id: t.evalRuns.id,
  agentId: sql<string>`${t.evalRuns.agentId}`,
  status: t.evalRuns.status,
  ranAt: t.evalRuns.ranAt,
  finishedAt: t.evalRuns.finishedAt,
  agentVersion: sql<number>`${t.evalRuns.agentVersion}`,
  casesTotal: sql<number>`jsonb_array_length(${t.evalRuns.caseSet})`,
  casesDone: sql<number>`jsonb_array_length(${t.evalRuns.caseResults})`,
  metrics: t.evalRuns.metricParts,
  durationMs: t.evalRuns.durationMs,
  costUsd: t.evalRuns.costUsd,
  errorReason: t.evalRuns.errorReason,
};

/**
 * The skill run's columns as overview queries read them. The `sql<…>` casts state
 * the invariant that `owner_kind = 'skill'` rows carry these columns (every query
 * using this selection filters on it).
 */
const skillSummarySelection = {
  id: t.evalRuns.id,
  skillId: sql<string>`${t.evalRuns.skillId}`,
  skillVersion: sql<number>`${t.evalRuns.skillVersion}`,
  carrierAgentId: sql<string>`${t.evalRuns.carrierAgentId}`,
  carrierName: sql<string>`${t.evalRuns.carrierName}`,
  carrierVersion: sql<number>`${t.evalRuns.carrierVersion}`,
  carrierModel: sql<string>`${t.evalRuns.carrierModel}`,
  status: t.evalRuns.status,
  ranAt: t.evalRuns.ranAt,
  finishedAt: t.evalRuns.finishedAt,
  casesTotal: sql<number>`jsonb_array_length(${t.evalRuns.caseSet})`,
  casesDone: sql<number>`jsonb_array_length(${t.evalRuns.caseResults})`,
  withMetrics: t.evalRuns.metricParts,
  withoutMetrics: t.evalRuns.withoutMetrics,
  lift: t.evalRuns.lift,
  durationMs: t.evalRuns.durationMs,
  costUsd: t.evalRuns.costUsd,
  errorReason: t.evalRuns.errorReason,
};

/** The trend's columns: scalars and the small `lift` jsonb only (NFR-13). */
const skillTrendSelection = {
  id: t.evalRuns.id,
  ranAt: t.evalRuns.ranAt,
  skillVersion: sql<number>`${t.evalRuns.skillVersion}`,
  carrierAgentId: sql<string>`${t.evalRuns.carrierAgentId}`,
  carrierName: sql<string>`${t.evalRuns.carrierName}`,
  carrierVersion: sql<number>`${t.evalRuns.carrierVersion}`,
  carrierModel: sql<string>`${t.evalRuns.carrierModel}`,
  recall: t.evalRuns.recall,
  precision: t.evalRuns.precision,
  citationAccuracy: t.evalRuns.citationAccuracy,
  lift: t.evalRuns.lift,
  costUsd: t.evalRuns.costUsd,
};

export interface CaseOwner {
  kind: EvalOwnerKind;
  id: string;
}

export interface InsertCase {
  workspaceId: string;
  owner: CaseOwner;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: EvalCaseMeta;
  expectation: EvalExpectation;
  /** Null for a case made in the Case Editor. */
  sourceFindingId: string | null;
  notes?: string | null;
  /** A replacement takes the replaced case's place in the list (AC-15). */
  createdAt?: Date;
}

/** The columns an in-place edit may change (AC-14). */
export interface CaseInPlaceValues {
  name?: string;
  notes?: string | null;
  expectation?: EvalExpectation;
}

export interface SkillForEval {
  id: string;
  name: string;
}

/** One skill recorded for a finding's review run, in run order (AC-53). */
export interface FindingSkillRow {
  skillId: string;
  name: string;
  order: number;
}

export interface InsertRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  snapshot: EvalRunSnapshot;
  caseSet: EvalCaseRef[];
}

export interface FinalizeRun {
  status: 'completed' | 'partial' | 'errored';
  metrics: EvalMetrics | null;
  casesErrored: number;
  durationMs: number;
  costUsd: number | null;
  errorReason: string | null;
}

export interface InsertSkillRun {
  workspaceId: string;
  skillId: string;
  skillVersion: number;
  carrier: {
    agentId: string;
    name: string;
    version: number;
    model: string;
  };
  /** The carrier snapshot: stored in `snapshot` (the with-arm's prompt inputs). */
  snapshot: EvalRunSnapshot;
  skillSnapshot: EvalSkillRunSnapshot;
  caseSet: EvalCaseRef[];
}

export interface FinalizeSkillRun {
  status: 'completed' | 'partial' | 'errored';
  withMetrics: EvalMetrics | null;
  withoutMetrics: EvalMetrics | null;
  lift: EvalLift | null;
  casesErrored: number;
  durationMs: number;
  costUsd: number | null;
  errorReason: string | null;
}

/** A skill's newest finished run as the case list reads it: the per-case arms only. */
export interface SkillRunResults {
  runId: string;
  withResults: EvalCaseOutcome[];
  withoutResults: EvalCaseOutcome[];
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- case creation context ------------------------------------------------

  /** finding → review → pull → repo (+ the agent, if it still exists), or undefined when not in this workspace. */
  async findingContext(
    workspaceId: string,
    findingId: string,
  ): Promise<FindingCaseContext | undefined> {
    const [row] = await this.db
      .select({
        finding: {
          id: t.findings.id,
          file: t.findings.file,
          startLine: t.findings.startLine,
          endLine: t.findings.endLine,
          severity: t.findings.severity,
          category: t.findings.category,
          title: t.findings.title,
          kind: t.findings.kind,
          acceptedAt: t.findings.acceptedAt,
          dismissedAt: t.findings.dismissedAt,
        },
        agentId: t.reviews.agentId,
        agentRowId: t.agents.id,
        pull: {
          id: t.pullRequests.id,
          number: t.pullRequests.number,
          title: t.pullRequests.title,
          body: t.pullRequests.body,
          base: t.pullRequests.base,
          headSha: t.pullRequests.headSha,
        },
        repo: { owner: t.repos.owner, name: t.repos.name, fullName: t.repos.fullName },
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.pullRequests, eq(t.reviews.prId, t.pullRequests.id))
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .leftJoin(
        t.agents,
        and(eq(t.agents.id, t.reviews.agentId), eq(t.agents.workspaceId, workspaceId)),
      )
      .where(
        and(
          eq(t.findings.id, findingId),
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.repos.workspaceId, workspaceId),
        ),
      );
    if (!row) return undefined;
    return {
      finding: row.finding,
      agentId: row.agentId,
      agentExists: row.agentRowId !== null,
      pull: row.pull,
      repo: row.repo,
    };
  }

  /** Persisted file patches of a PR (fallback when no clone diff is available). Caller has checked the PR's workspace. */
  async prFiles(prId: string): Promise<{ path: string; patch: string | null }[]> {
    return this.db
      .select({ path: t.prFiles.path, patch: t.prFiles.patch })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async pullExists(workspaceId: string, pullId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.id, pullId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row !== undefined;
  }

  // ---- cases ------------------------------------------------------------------

  /** The owner's case made from this finding — at most one per owner and finding (NFR-11). */
  async getCaseBySourceFinding(
    workspaceId: string,
    findingId: string,
    owner: CaseOwner,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          this.ownerCases(workspaceId, owner),
          eq(t.evalCases.sourceFindingId, findingId),
        ),
      );
    return row;
  }

  /** Names of the owner's cases — input to the `-2`/`-3` suffix. */
  async caseNames(workspaceId: string, owner: CaseOwner): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.evalCases.name })
      .from(t.evalCases)
      .where(this.ownerCases(workspaceId, owner));
    return rows.map((r) => r.name);
  }

  /**
   * Insert a case. The unique index on `(source_finding_id, owner_kind,
   * owner_id)` makes a racing second insert a 409 `eval_case_exists` carrying
   * the winner's id (SPEC-08 EC-3, SPEC-09 EC-39/EC-43).
   */
  async insertCase(values: InsertCase, tx?: DbTx): Promise<EvalCaseRow> {
    const db = tx ?? this.db;
    try {
      const [row] = await db
        .insert(t.evalCases)
        .values({
          workspaceId: values.workspaceId,
          ownerKind: values.owner.kind,
          ownerId: values.owner.id,
          name: values.name,
          inputDiff: values.inputDiff,
          inputFiles: values.inputFiles,
          inputMeta: values.inputMeta,
          expectedOutput: values.expectation,
          notes: values.notes ?? null,
          sourceFindingId: values.sourceFindingId,
          ...(values.createdAt ? { createdAt: values.createdAt } : {}),
        })
        .returning();
      return row!;
    } catch (err) {
      if (values.sourceFindingId && isUniqueViolation(err)) {
        const existing = await this.getCaseBySourceFinding(
          values.workspaceId,
          values.sourceFindingId,
          values.owner,
        );
        if (existing) {
          throw new AppError(
            EVAL_ERROR.caseExists,
            EVAL_ERROR_MESSAGE.eval_case_exists,
            409,
            { case_id: existing.id },
          );
        }
      }
      throw err;
    }
  }

  /** The owner's cases, newest first. */
  async listCases(workspaceId: string, owner: CaseOwner): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(this.ownerCases(workspaceId, owner))
      .orderBy(desc(t.evalCases.createdAt), desc(t.evalCases.id));
  }

  async countCases(workspaceId: string, owner: CaseOwner): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.evalCases)
      .where(this.ownerCases(workspaceId, owner));
    return row?.n ?? 0;
  }

  /** Case counts per agent for the whole workspace (dashboard). */
  async caseCountsByAgent(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ agentId: t.evalCases.ownerId, n: count() })
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.evalCases.ownerId);
    return new Map(rows.map((r) => [r.agentId, r.n]));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  /**
   * The source PR of a case's finding, or undefined when the finding, its
   * review or its PR is gone (EC-8). Scoped through `reviews.workspace_id`.
   */
  async caseSource(
    workspaceId: string,
    sourceFindingId: string,
  ): Promise<{ repoId: string } | undefined> {
    const [row] = await this.db
      .select({ repoId: t.pullRequests.repoId })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.pullRequests, eq(t.reviews.prId, t.pullRequests.id))
      .where(and(eq(t.findings.id, sourceFindingId), eq(t.reviews.workspaceId, workspaceId)));
    return row;
  }

  /** AC-14: name, notes and the display-only expectation fields change under the same id. */
  async updateCaseInPlace(
    workspaceId: string,
    id: string,
    values: CaseInPlaceValues,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(values.name !== undefined ? { name: values.name } : {}),
        ...(values.notes !== undefined ? { notes: values.notes } : {}),
        ...(values.expectation !== undefined ? { expectedOutput: values.expectation } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  /**
   * AC-15: one transaction — delete the old case, then insert the replacement (taking
   * the old case's `created_at`, so it keeps its place in the list). The delete goes
   * first and doubles as the row lock: a racing replace or DELETE that already took
   * the row leaves it nothing to delete, so this one throws the same 404 an unknown
   * case gets and rolls back — never a duplicate or a resurrected case.
   */
  async replaceCase(
    workspaceId: string,
    oldId: string,
    values: InsertCase,
  ): Promise<EvalCaseRow> {
    return this.db.transaction(async (tx) => {
      const deleted = await tx
        .delete(t.evalCases)
        .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, oldId)))
        .returning({ id: t.evalCases.id });
      if (deleted.length === 0) throw new NotFoundError(NOT_FOUND.case);
      return this.insertCase(values, tx);
    });
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** Every case of the owner as a run needs it, oldest first (EC-18: read once at run start). */
  async casesForRun(workspaceId: string, owner: CaseOwner): Promise<FrozenCase[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(this.ownerCases(workspaceId, owner))
      .orderBy(asc(t.evalCases.createdAt), asc(t.evalCases.id));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      inputDiff: r.inputDiff,
      inputMeta: { title: r.inputMeta.title, body: r.inputMeta.body },
      expectation: r.expectedOutput,
    }));
  }

  /** Findings of one PR that are the source of a case (AC-61). `agent_id` = the case's owner. */
  async caseLinks(
    workspaceId: string,
    pullId: string,
  ): Promise<{ findingId: string; caseId: string; agentId: string }[]> {
    return this.db
      .select({
        findingId: t.findings.id,
        caseId: t.evalCases.id,
        agentId: t.evalCases.ownerId,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .innerJoin(t.evalCases, eq(t.evalCases.sourceFindingId, t.findings.id))
      .where(
        and(
          eq(t.reviews.prId, pullId),
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
        ),
      );
  }

  // ---- skills (read-only here; Case Editor owner + finding → skill case) -------------

  /** The skill, or undefined when it is not in this workspace. */
  async skillForEval(workspaceId: string, skillId: string): Promise<SkillForEval | undefined> {
    const [row] = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)));
    return row;
  }

  /**
   * Skills recorded for the run of the finding's review, in run order (AC-53,
   * EC-36/EC-37), with the finding's existing skill-owned case ids. Undefined
   * when the finding is not in this workspace. Scoped through `reviews`,
   * `agent_runs` and `skills`, each `workspace_id`-checked.
   */
  async findingSkills(
    workspaceId: string,
    findingId: string,
  ): Promise<{ skills: (FindingSkillRow & { caseId: string | null })[] } | undefined> {
    const [finding] = await this.db
      .select({ runId: t.reviews.runId })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId)));
    if (!finding) return undefined;
    if (!finding.runId) return { skills: [] };

    const skills: FindingSkillRow[] = await this.db
      .select({
        skillId: t.skills.id,
        name: t.skills.name,
        order: t.agentRunSkills.order,
      })
      .from(t.agentRunSkills)
      .innerJoin(t.agentRuns, eq(t.agentRunSkills.runId, t.agentRuns.id))
      .innerJoin(t.skills, eq(t.agentRunSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentRunSkills.runId, finding.runId),
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(t.agentRunSkills.order), asc(t.skills.name));
    if (skills.length === 0) return { skills: [] };

    const cases = await this.db
      .select({ id: t.evalCases.id, ownerId: t.evalCases.ownerId })
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'skill'),
          eq(t.evalCases.sourceFindingId, findingId),
          inArray(
            t.evalCases.ownerId,
            skills.map((s) => s.skillId),
          ),
        ),
      );
    const caseBySkill = new Map(cases.map((c) => [c.ownerId, c.id]));
    return { skills: skills.map((s) => ({ ...s, caseId: caseBySkill.get(s.skillId) ?? null })) };
  }

  // ---- runs: writes --------------------------------------------------------------

  /**
   * Insert a `running` run. The partial unique index `eval_runs_one_running_uq`
   * makes a second concurrent start a 409 `eval_run_in_progress` carrying the
   * running run's id (EC-10, EC-37).
   */
  async insertRun(values: InsertRun): Promise<string> {
    try {
      const [row] = await this.db
        .insert(t.evalRuns)
        .values({
          workspaceId: values.workspaceId,
          agentId: values.agentId,
          status: 'running',
          agentVersion: values.agentVersion,
          snapshot: values.snapshot,
          caseSet: values.caseSet,
          caseResults: [],
        })
        .returning({ id: t.evalRuns.id });
      return row!.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const runId = await this.runningRunId(values.workspaceId, values.agentId);
        if (runId) {
          throw new AppError(
            EVAL_ERROR.runInProgress,
            EVAL_ERROR_MESSAGE.eval_run_in_progress,
            409,
            { run_id: runId },
          );
        }
      }
      throw err;
    }
  }

  /**
   * Persist the per-case results so far. Returns false when the run is no
   * longer `running` — it was deleted with its agent (EC-33) or reaped — so
   * the executor stops without writing anything further.
   */
  async saveProgress(
    workspaceId: string,
    runId: string,
    outcomes: EvalCaseOutcome[],
  ): Promise<boolean> {
    const rows = await this.db
      .update(t.evalRuns)
      .set({ caseResults: outcomes })
      .where(this.runningRun(workspaceId, runId))
      .returning({ id: t.evalRuns.id });
    return rows.length > 0;
  }

  /** Whether the run still exists and is `running` (checked before each case's LLM call). */
  async isRunning(workspaceId: string, runId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.evalRuns.id })
      .from(t.evalRuns)
      .where(this.runningRun(workspaceId, runId));
    return row !== undefined;
  }

  /** Finish a running run: status, aggregate metrics, `finished_at`. False when it is gone. */
  async finalizeRun(
    workspaceId: string,
    runId: string,
    values: FinalizeRun,
  ): Promise<boolean> {
    const m = values.metrics;
    const rows = await this.db
      .update(t.evalRuns)
      .set({
        status: values.status,
        metricParts: m,
        recall: m?.recall.value ?? null,
        precision: m?.precision.value ?? null,
        citationAccuracy: m?.citation_accuracy.value ?? null,
        tracesPassed: m?.traces_passed ?? null,
        tracesTotal: m?.traces_total ?? null,
        casesErrored: values.casesErrored,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        errorReason: values.errorReason,
        finishedAt: new Date(),
      })
      .where(this.runningRun(workspaceId, runId))
      .returning({ id: t.evalRuns.id });
    return rows.length > 0;
  }

  /** Boot reap (EC-14): every `running` run belongs to a dead process. Not workspace-scoped, like the review reaper. */
  async reapRunning(): Promise<number> {
    const rows = await this.db
      .update(t.evalRuns)
      .set({ status: 'errored', errorReason: INTERRUPTED_REASON, finishedAt: new Date() })
      .where(eq(t.evalRuns.status, 'running'))
      .returning({ id: t.evalRuns.id });
    return rows.length;
  }

  /**
   * EC-9 cascade: delete the agent's runs and cases. Pass the agent-delete
   * transaction so all three deletes commit or roll back together.
   */
  async deleteByAgent(workspaceId: string, agentId: string, tx?: DbTx): Promise<void> {
    const db = tx ?? this.db;
    await db
      .delete(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId),
          eq(t.evalRuns.ownerKind, 'agent'),
          eq(t.evalRuns.agentId, agentId),
        ),
      );
    await db.delete(t.evalCases).where(this.ownerCases(workspaceId, { kind: 'agent', id: agentId }));
  }

  /**
   * SPEC-09 EC-23 cascade for a deleted skill: its runs and its cases. Pass the
   * skill-delete transaction so everything commits together. A run still
   * `running` is deleted too, which stops its executor before the next review (EC-24).
   */
  async deleteBySkill(workspaceId: string, skillId: string, tx?: DbTx): Promise<void> {
    const db = tx ?? this.db;
    await db
      .delete(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId),
          eq(t.evalRuns.ownerKind, 'skill'),
          eq(t.evalRuns.skillId, skillId),
        ),
      );
    await db.delete(t.evalCases).where(this.ownerCases(workspaceId, { kind: 'skill', id: skillId }));
  }

  // ---- runs: reads ------------------------------------------------------------------

  async runningRunId(workspaceId: string, agentId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: t.evalRuns.id })
      .from(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId),
          eq(t.evalRuns.ownerKind, 'agent'),
          eq(t.evalRuns.agentId, agentId),
          eq(t.evalRuns.status, 'running'),
        ),
      );
    return row?.id ?? null;
  }

  /** The full row with its jsonb — detail and compare only. */
  async getRunRow(workspaceId: string, id: string): Promise<EvalRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.id, id)));
    return row;
  }

  /** The agent's newest finished run WITH `case_results` (per-case latest results). */
  async latestFinishedRunRow(
    workspaceId: string,
    agentId: string,
  ): Promise<EvalRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalRuns)
      .where(this.agentRuns(workspaceId, agentId, true))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(1);
    return row;
  }

  /** Scalar run summaries of one agent, newest first. */
  async listRunSummaries(
    workspaceId: string,
    agentId: string,
    opts: { finishedOnly: boolean; limit: number },
  ): Promise<EvalRunSummary[]> {
    return this.db
      .select(summarySelection)
      .from(t.evalRuns)
      .where(this.agentRuns(workspaceId, agentId, opts.finishedOnly))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(opts.limit);
  }

  async countFinishedRuns(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.evalRuns)
      .where(this.agentRuns(workspaceId, agentId, true));
    return row?.n ?? 0;
  }

  /** The workspace's newest runs across agents (dashboard). */
  async recentRunSummaries(workspaceId: string, limit: number): Promise<EvalRunSummary[]> {
    return this.db
      .select(summarySelection)
      .from(t.evalRuns)
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.ownerKind, 'agent')))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
  }

  // ---- skill runs (SPEC-09) -----------------------------------------------------------

  /** The skill under test as a run reads it, or undefined when it is not in this workspace. */
  async skillForRun(workspaceId: string, skillId: string): Promise<SkillForRun | undefined> {
    const [row] = await this.db
      .select({
        id: t.skills.id,
        name: t.skills.name,
        body: t.skills.body,
        version: t.skills.version,
        enabled: t.skills.enabled,
      })
      .from(t.skills)
      .where(and(eq(t.skills.id, skillId), eq(t.skills.workspaceId, workspaceId)));
    return row;
  }

  /**
   * Agents of the workspace linked to the skill — the carrier choices (AC-20,
   * AC-41), with the link's own enabled flag (EC-46). Scoped on BOTH the agent
   * and the skill.
   */
  async carriersForSkill(workspaceId: string, skillId: string): Promise<CarrierRow[]> {
    return this.db
      .select({
        agentId: t.agents.id,
        name: t.agents.name,
        version: t.agents.version,
        model: t.agents.model,
        enabled: t.agents.enabled,
        linkEnabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.skillId, skillId),
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(t.agents.name), asc(t.agents.id));
  }

  /**
   * Every skill linked to the carrier, both enable flags, in link order (ties
   * by name so the order is deterministic) — the input of `buildArms` (AC-24).
   */
  async carrierLinks(workspaceId: string, carrierAgentId: string): Promise<CarrierLink[]> {
    return this.db
      .select({
        skillId: t.skills.id,
        name: t.skills.name,
        body: t.skills.body,
        order: t.agentSkills.order,
        linkEnabled: t.agentSkills.enabled,
        skillEnabled: t.skills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, carrierAgentId),
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(t.agentSkills.order), asc(t.skills.name), asc(t.skills.id));
  }

  /**
   * Insert a `running` skill run. The partial unique index
   * `eval_runs_one_running_skill_uq` makes a second concurrent start a 409
   * `eval_run_in_progress` carrying the running run's id (EC-14).
   */
  async insertSkillRun(values: InsertSkillRun): Promise<string> {
    try {
      const [row] = await this.db
        .insert(t.evalRuns)
        .values({
          workspaceId: values.workspaceId,
          ownerKind: 'skill',
          status: 'running',
          skillId: values.skillId,
          skillVersion: values.skillVersion,
          carrierAgentId: values.carrier.agentId,
          carrierName: values.carrier.name,
          carrierVersion: values.carrier.version,
          carrierModel: values.carrier.model,
          snapshot: values.snapshot,
          skillSnapshot: values.skillSnapshot,
          caseSet: values.caseSet,
          caseResults: [],
          withoutResults: [],
        })
        .returning({ id: t.evalRuns.id });
      return row!.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const runId = await this.runningSkillRunId(values.workspaceId, values.skillId);
        if (runId) {
          throw new AppError(
            EVAL_ERROR.runInProgress,
            EVAL_ERROR_MESSAGE.eval_run_in_progress,
            409,
            { run_id: runId },
          );
        }
      }
      throw err;
    }
  }

  /**
   * Persist both arms' results so far (one case = one entry in each). False when
   * the run is no longer `running` — its skill was deleted (EC-24) or it was
   * reaped — so the executor stops without writing anything further.
   */
  async saveSkillProgress(
    workspaceId: string,
    runId: string,
    withResults: EvalCaseOutcome[],
    withoutResults: EvalCaseOutcome[],
  ): Promise<boolean> {
    const rows = await this.db
      .update(t.evalRuns)
      .set({ caseResults: withResults, withoutResults })
      .where(this.runningRun(workspaceId, runId))
      .returning({ id: t.evalRuns.id });
    return rows.length > 0;
  }

  /**
   * Finish a running skill run (AC-32): the paired per-case results of both arms,
   * both arms' metrics, the lifts. The with-arm values go in the agent-shaped columns.
   */
  async finalizeSkillRun(
    workspaceId: string,
    runId: string,
    values: FinalizeSkillRun,
    /** The paired per-case results; omitted when a crashed run keeps what progress saved. */
    results?: { with: EvalCaseOutcome[]; without: EvalCaseOutcome[] },
  ): Promise<boolean> {
    const m = values.withMetrics;
    const rows = await this.db
      .update(t.evalRuns)
      .set({
        status: values.status,
        ...(results ? { caseResults: results.with, withoutResults: results.without } : {}),
        metricParts: m,
        withoutMetrics: values.withoutMetrics,
        lift: values.lift,
        recall: m?.recall.value ?? null,
        precision: m?.precision.value ?? null,
        citationAccuracy: m?.citation_accuracy.value ?? null,
        tracesPassed: m?.traces_passed ?? null,
        tracesTotal: m?.traces_total ?? null,
        casesErrored: values.casesErrored,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        errorReason: values.errorReason,
        finishedAt: new Date(),
      })
      .where(this.runningRun(workspaceId, runId))
      .returning({ id: t.evalRuns.id });
    return rows.length > 0;
  }

  async runningSkillRunId(workspaceId: string, skillId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: t.evalRuns.id })
      .from(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId),
          eq(t.evalRuns.ownerKind, 'skill'),
          eq(t.evalRuns.skillId, skillId),
          eq(t.evalRuns.status, 'running'),
        ),
      );
    return row?.id ?? null;
  }

  /** The skill's newest finished runs, newest first — scalar columns only (NFR-13). */
  async listSkillRunSummaries(
    workspaceId: string,
    skillId: string,
    limit: number,
  ): Promise<EvalSkillRunSummary[]> {
    return this.db
      .select(skillSummarySelection)
      .from(t.evalRuns)
      .where(this.skillRuns(workspaceId, skillId))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
  }

  /** The skill's trend window: finished runs, newest first, scalar columns only (NFR-13, AC-41). */
  async listSkillTrendRows(
    workspaceId: string,
    skillId: string,
    limit: number,
  ): Promise<EvalSkillTrendRow[]> {
    return this.db
      .select(skillTrendSelection)
      .from(t.evalRuns)
      .where(this.skillRuns(workspaceId, skillId))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
  }

  /** Per-case arms of the skill's newest finished run (AC-40, AC-59); never the snapshots. */
  async latestFinishedSkillResults(
    workspaceId: string,
    skillId: string,
  ): Promise<SkillRunResults | undefined> {
    const [row] = await this.db
      .select({
        runId: t.evalRuns.id,
        withResults: t.evalRuns.caseResults,
        withoutResults: t.evalRuns.withoutResults,
      })
      .from(t.evalRuns)
      .where(this.skillRuns(workspaceId, skillId))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(1);
    return row ? { ...row, withoutResults: row.withoutResults ?? [] } : undefined;
  }

  // ---- predicates --------------------------------------------------------------------

  private ownerCases(workspaceId: string, owner: CaseOwner) {
    return and(
      eq(t.evalCases.workspaceId, workspaceId),
      eq(t.evalCases.ownerKind, owner.kind),
      eq(t.evalCases.ownerId, owner.id),
    );
  }

  private agentRuns(workspaceId: string, agentId: string, finishedOnly: boolean) {
    return and(
      eq(t.evalRuns.workspaceId, workspaceId),
      // NFR-5: a skill run never shows up in an agent read.
      eq(t.evalRuns.ownerKind, 'agent'),
      eq(t.evalRuns.agentId, agentId),
      finishedOnly ? inArray(t.evalRuns.status, [...FINISHED]) : undefined,
    );
  }

  /** The skill's finished runs (`completed` | `partial`). */
  private skillRuns(workspaceId: string, skillId: string) {
    return and(
      eq(t.evalRuns.workspaceId, workspaceId),
      eq(t.evalRuns.ownerKind, 'skill'),
      eq(t.evalRuns.skillId, skillId),
      inArray(t.evalRuns.status, [...FINISHED]),
    );
  }

  private runningRun(workspaceId: string, runId: string) {
    return and(
      eq(t.evalRuns.workspaceId, workspaceId),
      eq(t.evalRuns.id, runId),
      eq(t.evalRuns.status, 'running'),
    );
  }
}
