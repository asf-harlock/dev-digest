import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { EvalCaseOutcome, EvalExpectation, EvalCaseMeta, EvalMetrics, EvalRunSnapshot, EvalCaseRef } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalCaseRow, EvalRunRow } from '../../db/rows.js';
import { AppError } from '../../platform/errors.js';
import { EVAL_ERROR, EVAL_ERROR_MESSAGE, INTERRUPTED_REASON } from './constants.js';
import { isUniqueViolation } from './helpers.js';
import type { EvalRunSummary, FindingCaseContext, FrozenCase } from './types.js';

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

/** Scalar run columns + jsonb lengths computed in SQL; mirrors `EvalRunSummary`. */
const summarySelection = {
  id: t.evalRuns.id,
  agentId: t.evalRuns.agentId,
  status: t.evalRuns.status,
  ranAt: t.evalRuns.ranAt,
  finishedAt: t.evalRuns.finishedAt,
  agentVersion: t.evalRuns.agentVersion,
  casesTotal: sql<number>`jsonb_array_length(${t.evalRuns.caseSet})`,
  casesDone: sql<number>`jsonb_array_length(${t.evalRuns.caseResults})`,
  metrics: t.evalRuns.metricParts,
  durationMs: t.evalRuns.durationMs,
  costUsd: t.evalRuns.costUsd,
  errorReason: t.evalRuns.errorReason,
};

export interface InsertCase {
  workspaceId: string;
  agentId: string;
  name: string;
  inputDiff: string;
  inputFiles: string[];
  inputMeta: EvalCaseMeta;
  expectation: EvalExpectation;
  sourceFindingId: string;
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

  async getCaseBySourceFinding(
    workspaceId: string,
    findingId: string,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(
        and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.sourceFindingId, findingId)),
      );
    return row;
  }

  /** Names of the agent's cases — input to the `-2`/`-3` suffix. */
  async caseNames(workspaceId: string, agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: t.evalCases.name })
      .from(t.evalCases)
      .where(this.agentCases(workspaceId, agentId));
    return rows.map((r) => r.name);
  }

  /**
   * Insert a case. The unique index on `source_finding_id` makes a racing
   * second insert a 409 `eval_case_exists` carrying the winner's id (EC-3).
   */
  async insertCase(values: InsertCase): Promise<EvalCaseRow> {
    try {
      const [row] = await this.db
        .insert(t.evalCases)
        .values({
          workspaceId: values.workspaceId,
          ownerKind: 'agent',
          ownerId: values.agentId,
          name: values.name,
          inputDiff: values.inputDiff,
          inputFiles: values.inputFiles,
          inputMeta: values.inputMeta,
          expectedOutput: values.expectation,
          sourceFindingId: values.sourceFindingId,
        })
        .returning();
      return row!;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const existing = await this.getCaseBySourceFinding(
          values.workspaceId,
          values.sourceFindingId,
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

  /** The agent's cases, newest first. */
  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(this.agentCases(workspaceId, agentId))
      .orderBy(desc(t.evalCases.createdAt), desc(t.evalCases.id));
  }

  async countCases(workspaceId: string, agentId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.evalCases)
      .where(this.agentCases(workspaceId, agentId));
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

  async renameCase(
    workspaceId: string,
    id: string,
    name: string,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  /** Every case of the agent as a run needs it, oldest first (EC-18: read once at run start). */
  async casesForRun(workspaceId: string, agentId: string): Promise<FrozenCase[]> {
    const rows = await this.db
      .select()
      .from(t.evalCases)
      .where(this.agentCases(workspaceId, agentId))
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
      .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.agentId, agentId)));
    await db.delete(t.evalCases).where(this.agentCases(workspaceId, agentId));
  }

  // ---- runs: reads ------------------------------------------------------------------

  async runningRunId(workspaceId: string, agentId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: t.evalRuns.id })
      .from(t.evalRuns)
      .where(
        and(
          eq(t.evalRuns.workspaceId, workspaceId),
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
      .where(eq(t.evalRuns.workspaceId, workspaceId))
      .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
      .limit(limit);
  }

  // ---- predicates --------------------------------------------------------------------

  private agentCases(workspaceId: string, agentId: string) {
    return and(
      eq(t.evalCases.workspaceId, workspaceId),
      eq(t.evalCases.ownerKind, 'agent'),
      eq(t.evalCases.ownerId, agentId),
    );
  }

  private agentRuns(workspaceId: string, agentId: string, finishedOnly: boolean) {
    return and(
      eq(t.evalRuns.workspaceId, workspaceId),
      eq(t.evalRuns.agentId, agentId),
      finishedOnly ? inArray(t.evalRuns.status, [...FINISHED]) : undefined,
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
