import type {
  EvalCase,
  EvalCaseLatestResult,
  EvalCaseListItem,
  EvalCaseMeta,
  EvalCaseOutcome,
  EvalCaseRef,
  EvalExpectation,
  EvalMetrics,
  EvalRunDetail,
  EvalRunRecord,
  EvalTrendPoint,
} from '@devdigest/shared';
import type { EvalCaseRow, EvalRunRow } from '../../db/rows.js';
import { AppError } from '../../platform/errors.js';
import {
  CASE_SLUG_FALLBACK,
  CASE_SLUG_MAX,
  ERROR_REASON_MAX,
  EVAL_ERROR_MESSAGE,
  EVAL_TASK_LINE,
  type EvalErrorCode,
  PG_UNIQUE_VIOLATION,
} from './constants.js';
import type { EvalRunSummary } from './types.js';

/**
 * SPEC-08 pure transforms: slugs, row → DTO mapping, small derivations.
 * No DB, no container, no LLM.
 */

// ---- case naming (AC-6, UI-6, NQ-1) ----------------------------------------

/** Lowercase `a-z0-9-` slug of a title, at most 60 chars; `eval-case` when empty. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CASE_SLUG_MAX)
    .replace(/-+$/g, '');
  return slug || CASE_SLUG_FALLBACK;
}

/** `base`, or `base-2`, `base-3`, … appended AFTER the cut when the name is taken. */
export function uniqueCaseName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** AC-2/AC-3, EC-7: accepted → must_find, dismissed → must_not_flag; the later decision wins if both. */
export function expectationTypeFor(
  acceptedAt: Date | null,
  dismissedAt: Date | null,
): EvalExpectation['type'] | null {
  if (acceptedAt && dismissedAt) {
    return acceptedAt.getTime() >= dismissedAt.getTime() ? 'must_find' : 'must_not_flag';
  }
  if (acceptedAt) return 'must_find';
  if (dismissedAt) return 'must_not_flag';
  return null;
}

/** Task line for an eval review: the frozen title plus the author-free guidance. */
export function evalTaskLine(frozenTitle: string): string {
  return `Review pull request "${frozenTitle}". ${EVAL_TASK_LINE}`;
}

// ---- errors ------------------------------------------------------------------

/** An API error with one of the SPEC-08 codes; `details` carries the ids the client needs. */
export function evalError(
  code: EvalErrorCode,
  statusCode: 404 | 409 | 422,
  details?: Record<string, string>,
): AppError {
  return new AppError(code, EVAL_ERROR_MESSAGE[code], statusCode, details);
}

/** Postgres unique violation, however the driver wraps it. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === PG_UNIQUE_VIOLATION || e?.cause?.code === PG_UNIQUE_VIOLATION;
}

/** A stored / exposed per-case error reason: single line, capped. */
export function toErrorReason(err: unknown, fallback: string): string {
  const msg = err instanceof Error && err.message ? err.message : fallback;
  const oneLine = msg.replace(/\s+/g, ' ').trim();
  return oneLine.length > ERROR_REASON_MAX ? `${oneLine.slice(0, ERROR_REASON_MAX)}…` : oneLine;
}

// ---- row → DTO ---------------------------------------------------------------

export function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff,
    input_meta: row.inputMeta,
    expectation: row.expectedOutput,
    source_finding_id: row.sourceFindingId,
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

/** A case's result in one run → the compact shape the list and the modal show (AC-12). */
export function toLatestResult(
  runId: string,
  outcome: EvalCaseOutcome | undefined,
): EvalCaseLatestResult | null {
  if (!outcome) return null;
  const state: EvalCaseLatestResult['state'] =
    outcome.status === 'errored' ? 'errored' : outcome.pass ? 'passed' : 'failed';
  return {
    run_id: runId,
    state,
    expected_count: outcome.expected_count,
    got_count: outcome.got_count,
    duration_ms: outcome.duration_ms,
    cost_usd: outcome.cost_usd,
    error_reason: outcome.error_reason,
  };
}

export function toCaseListItem(
  row: EvalCaseRow,
  latest: EvalCaseLatestResult | null,
): EvalCaseListItem {
  return {
    id: row.id,
    name: row.name,
    expectation: row.expectedOutput,
    created_at: row.createdAt.toISOString(),
    latest_result: latest,
  };
}

export function toRunRecord(run: EvalRunSummary, agentName: string | null): EvalRunRecord {
  return {
    id: run.id,
    agent_id: run.agentId,
    agent_name: agentName,
    status: run.status,
    started_at: run.ranAt.toISOString(),
    finished_at: run.finishedAt ? run.finishedAt.toISOString() : null,
    agent_version: run.agentVersion,
    cases_total: run.casesTotal,
    cases_done: run.casesDone,
    metrics: run.metrics,
    duration_ms: run.durationMs,
    cost_usd: run.costUsd,
    error_reason: run.errorReason,
  };
}

/** A full run row (with its jsonb) → the scalar summary. */
export function summaryFromRow(row: EvalRunRow): EvalRunSummary {
  return {
    id: row.id,
    agentId: row.agentId,
    status: row.status,
    ranAt: row.ranAt,
    finishedAt: row.finishedAt,
    agentVersion: row.agentVersion,
    casesTotal: row.caseSet.length,
    casesDone: row.caseResults.length,
    metrics: row.metricParts,
    durationMs: row.durationMs,
    costUsd: row.costUsd,
    errorReason: row.errorReason,
  };
}

export function toRunDetail(row: EvalRunRow, agentName: string | null): EvalRunDetail {
  return {
    ...toRunRecord(summaryFromRow(row), agentName),
    snapshot: row.snapshot,
    case_set: row.caseSet,
    case_results: row.caseResults,
  };
}

/** A null metric is a gap in the trend, never 0 (EC-36). */
export function toTrendPoint(run: EvalRunSummary): EvalTrendPoint {
  return {
    run_id: run.id,
    ran_at: run.ranAt.toISOString(),
    agent_version: run.agentVersion,
    recall: run.metrics?.recall.value ?? null,
    precision: run.metrics?.precision.value ?? null,
    citation_accuracy: run.metrics?.citation_accuracy.value ?? null,
  };
}

/** Recall sparkline point (AC-53). */
export function recallOf(run: EvalRunSummary): number | null {
  return run.metrics?.recall.value ?? null;
}

// ---- run finalisation (AC-24, EC-13) ------------------------------------------

export type EvalFinalStatus = 'completed' | 'partial' | 'errored';

/** `errored` when nothing was scored (EC-13), `partial` when some case errored, else `completed`. */
export function finalStatus(metrics: EvalMetrics): EvalFinalStatus {
  if (metrics.traces_total === 0) return 'errored';
  return metrics.cases_errored > 0 ? 'partial' : 'completed';
}

/** EC-13: the first errored case's reason becomes the run's reason. */
export function firstErrorReason(outcomes: EvalCaseOutcome[]): string | null {
  return outcomes.find((o) => o.status === 'errored')?.error_reason ?? null;
}

export function toCaseRef(c: { id: string; name: string }): EvalCaseRef {
  return { id: c.id, name: c.name };
}

/** The frozen PR facts a case stores; kept as one helper so callers share the shape. */
export function buildCaseMeta(
  pull: { number: number; title: string; body: string | null },
  repoFullName: string,
): EvalCaseMeta {
  return {
    pr_number: pull.number,
    repo_full_name: repoFullName,
    title: pull.title,
    body: pull.body,
  };
}
