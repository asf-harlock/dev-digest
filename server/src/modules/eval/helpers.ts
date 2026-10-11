import type {
  EvalCase,
  EvalCaseUpdate,
  EvalAgentRunDetail,
  EvalSkillCaseListItem,
  EvalCaseLatestResult,
  EvalCaseListItem,
  EvalCaseMeta,
  EvalCaseOutcome,
  EvalCaseRef,
  EvalExpectation,
  EvalMetrics,
  EvalRunRecord,
  EvalSkillCarrier,
  EvalSkillCaseResult,
  EvalSkillRunDetail,
  EvalSkillRunRecord,
  EvalSkillRunSnapshot,
  EvalSkillTrendPoint,
  EvalTrendPoint,
  EvalRunSnapshot,
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
import { diffUnchanged } from './pasted-diff.js';
import { classifyEffect } from './arms.js';
import type { CarrierRow, EvalRunSummary, EvalSkillRunSummary, EvalSkillTrendRow, SkillForRun } from './types.js';

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
  statusCode: 404 | 409 | 413 | 422,
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

export function toEvalCaseDto(row: EvalCaseRow, replacedFromId?: string | null): EvalCase {
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
    ...(replacedFromId !== undefined ? { replaced_from_id: replacedFromId } : {}),
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

/** A row of `GET /skills/:id/eval-cases`; `latest_result` is null until skill runs exist (Phase B). */
export function toSkillCaseListItem(
  row: EvalCaseRow,
  latest: EvalSkillCaseListItem['latest_result'] = null,
): EvalSkillCaseListItem {
  return {
    id: row.id,
    name: row.name,
    expectation: row.expectedOutput,
    created_at: row.createdAt.toISOString(),
    source_finding_id: row.sourceFindingId,
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

/** A run row of an agent: `agent_id` / `agent_version` are only nullable for skill runs. */
export type AgentRunRow = EvalRunRow & { agentId: string; agentVersion: number };

export function isAgentRunRow(row: EvalRunRow): row is AgentRunRow {
  return row.ownerKind === 'agent' && row.agentId !== null && row.agentVersion !== null;
}

/** A run row of a skill, every column a skill run always carries made non-null. */
export type SkillRunRow = EvalRunRow & {
  skillId: string;
  skillVersion: number;
  carrierAgentId: string;
  carrierName: string;
  carrierVersion: number;
  carrierModel: string;
  skillSnapshot: EvalSkillRunSnapshot;
};

export function isSkillRunRow(row: EvalRunRow): row is SkillRunRow {
  return (
    row.ownerKind === 'skill' &&
    row.skillId !== null &&
    row.skillVersion !== null &&
    row.carrierAgentId !== null &&
    row.carrierName !== null &&
    row.carrierVersion !== null &&
    row.carrierModel !== null &&
    row.skillSnapshot !== null
  );
}

/** A full run row (with its jsonb) → the scalar summary. */
export function summaryFromRow(row: AgentRunRow): EvalRunSummary {
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

export function toRunDetail(row: AgentRunRow, agentName: string | null): EvalAgentRunDetail {
  return {
    ...toRunRecord(summaryFromRow(row), agentName),
    owner_kind: 'agent',
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
    // A missing price stays null — never 0 (EC-27).
    cost_usd: run.costUsd,
  };
}

/** Recall sparkline point (AC-53). */
export function recallOf(run: EvalRunSummary): number | null {
  return run.metrics?.recall.value ?? null;
}

// ---- skill runs (SPEC-09) ---------------------------------------------------------

export function toSkillCarrier(row: CarrierRow): EvalSkillCarrier {
  return {
    agent_id: row.agentId,
    name: row.name,
    version: row.version,
    model: row.model,
    enabled: row.enabled,
    link_enabled: row.linkEnabled,
  };
}

export function toSkillRunRecord(run: EvalSkillRunSummary, skillName: string): EvalSkillRunRecord {
  return {
    id: run.id,
    owner_kind: 'skill',
    skill_id: run.skillId,
    skill_name: skillName,
    skill_version: run.skillVersion,
    carrier: {
      agent_id: run.carrierAgentId,
      name: run.carrierName,
      version: run.carrierVersion,
      model: run.carrierModel,
    },
    status: run.status,
    started_at: run.ranAt.toISOString(),
    finished_at: run.finishedAt ? run.finishedAt.toISOString() : null,
    cases_total: run.casesTotal,
    cases_done: run.casesDone,
    with: run.withMetrics,
    without: run.withoutMetrics,
    lift: run.lift,
    cost_usd: run.costUsd,
    duration_ms: run.durationMs,
    error_reason: run.errorReason,
  };
}

/** A full skill run row (with its jsonb) → the scalar summary. */
export function skillSummaryFromRow(row: SkillRunRow): EvalSkillRunSummary {
  return {
    id: row.id,
    skillId: row.skillId,
    skillVersion: row.skillVersion,
    carrierAgentId: row.carrierAgentId,
    carrierName: row.carrierName,
    carrierVersion: row.carrierVersion,
    carrierModel: row.carrierModel,
    status: row.status,
    ranAt: row.ranAt,
    finishedAt: row.finishedAt,
    casesTotal: row.caseSet.length,
    casesDone: row.caseResults.length,
    withMetrics: row.metricParts,
    withoutMetrics: row.withoutMetrics,
    lift: row.lift,
    durationMs: row.durationMs,
    costUsd: row.costUsd,
    errorReason: row.errorReason,
  };
}

/** Both arms of each case, joined by case id, with the case's effect (AC-42). */
export function toSkillCaseResults(
  withResults: EvalCaseOutcome[],
  withoutResults: EvalCaseOutcome[],
): EvalSkillCaseResult[] {
  const withoutById = new Map(withoutResults.map((o) => [o.case_id, o]));
  return withResults.flatMap((w) => {
    const wo = withoutById.get(w.case_id);
    return wo
      ? [{ case_id: w.case_id, case_name: w.name, with: w, without: wo, effect: classifyEffect(w, wo) }]
      : [];
  });
}

export function toSkillRunDetail(row: SkillRunRow): EvalSkillRunDetail {
  return {
    ...toSkillRunRecord(skillSummaryFromRow(row), row.skillSnapshot.skill.name),
    snapshot: row.skillSnapshot,
    case_set: row.caseSet,
    case_results: toSkillCaseResults(row.caseResults, row.withoutResults ?? []),
  };
}

/** One point of a skill's trend: with-arm metrics, the lifts and the carrier, from scalars only (NFR-13). */
export function toSkillTrendPoint(run: EvalSkillTrendRow): EvalSkillTrendPoint {
  return {
    run_id: run.id,
    ran_at: run.ranAt.toISOString(),
    skill_version: run.skillVersion,
    carrier_agent_id: run.carrierAgentId,
    carrier_name: run.carrierName,
    carrier_version: run.carrierVersion,
    model: run.carrierModel,
    recall: run.recall,
    precision: run.precision,
    citation_accuracy: run.citationAccuracy,
    lift: run.lift ?? { recall: null, precision: null, citation_accuracy: null },
    cost_usd: run.costUsd,
  };
}

type OutcomeState = 'passed' | 'failed' | 'errored';

function outcomeState(o: EvalCaseOutcome): OutcomeState {
  return o.status === 'errored' ? 'errored' : o.pass ? 'passed' : 'failed';
}

/** Cost over both arms of one case; `null` when either arm has none (EC-27). */
function bothArmsCost(w: EvalCaseOutcome, wo: EvalCaseOutcome): number | null {
  return w.cost_usd == null || wo.cost_usd == null ? null : w.cost_usd + wo.cost_usd;
}

/** AC-40 — a case's `latest_result` in the skill case list. `null` when the case was not in the run. */
export function toSkillListLatest(
  runId: string,
  w: EvalCaseOutcome | undefined,
  wo: EvalCaseOutcome | undefined,
): EvalSkillCaseListItem['latest_result'] {
  if (!w || !wo) return null;
  return {
    run_id: runId,
    with_state: outcomeState(w),
    without_state: outcomeState(wo),
    effect: classifyEffect(w, wo),
    expected_count: w.expected_count,
    got_count: w.got_count,
    cost_usd: bothArmsCost(w, wo),
    error_reason: w.error_reason,
  };
}

/** AC-59 — a skill case's `latest_result` in the case detail: with-arm state, duration and cost over both arms. */
export function toSkillDetailLatest(
  runId: string,
  w: EvalCaseOutcome | undefined,
  wo: EvalCaseOutcome | undefined,
): EvalCaseLatestResult | null {
  if (!w || !wo) return null;
  return {
    run_id: runId,
    state: outcomeState(w),
    expected_count: w.expected_count,
    got_count: w.got_count,
    duration_ms: w.duration_ms + wo.duration_ms,
    cost_usd: bothArmsCost(w, wo),
    error_reason: w.error_reason,
  };
}

/** The skill under test + carrier as the run freezes them (AC-23, AC-24, AC-25). */
export function buildSkillRunSnapshot(input: {
  carrier: {
    id: string;
    name: string;
    version: number;
    provider: EvalSkillRunSnapshot['carrier']['provider'];
    model: string;
    strategy: EvalSkillRunSnapshot['carrier']['strategy'];
    systemPrompt: string;
  };
  skill: Pick<SkillForRun, 'name' | 'body' | 'version'>;
  withSkills: { name: string; body: string }[];
  withoutSkills: { name: string; body: string }[];
}): EvalSkillRunSnapshot {
  const { carrier, skill } = input;
  return {
    carrier: {
      agent_id: carrier.id,
      name: carrier.name,
      version: carrier.version,
      provider: carrier.provider,
      model: carrier.model,
      strategy: carrier.strategy,
      system_prompt: carrier.systemPrompt,
    },
    skill: { name: skill.name, body: skill.body, version: skill.version },
    with_skills: input.withSkills,
    without_skills: input.withoutSkills,
  };
}

/** The `EvalRunSnapshot` one arm is reviewed with: the carrier's config plus that arm's skill list. */
export function armSnapshot(
  snapshot: EvalSkillRunSnapshot,
  arm: 'with' | 'without',
): EvalRunSnapshot {
  const c = snapshot.carrier;
  return {
    provider: c.provider,
    model: c.model,
    strategy: c.strategy,
    system_prompt: c.system_prompt,
    skills: arm === 'with' ? snapshot.with_skills : snapshot.without_skills,
  };
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

// ---- Case Editor (SPEC-09) -----------------------------------------------------

/** AC-11: a manual case has no PR; `title` / `body` come from the editor's fields. */
export function buildManualMeta(input: { title: string; body?: string | null }): EvalCaseMeta {
  return {
    pr_number: null,
    repo_full_name: null,
    title: input.title,
    body: emptyToNull(input.body),
  };
}

/** EC-41: severity / category exist only on `must_find`; `must_not_flag` stores both as null. */
export function effectiveExpectation(
  input: Pick<EvalExpectation, 'type' | 'file' | 'start_line' | 'end_line' | 'severity' | 'category'>,
  title?: string | null,
): EvalExpectation {
  const mustFind = input.type === 'must_find';
  return {
    type: input.type,
    file: input.file,
    start_line: input.start_line,
    end_line: input.end_line,
    severity: mustFind ? (input.severity ?? null) : null,
    category: mustFind ? (input.category ?? null) : null,
    title: title ?? null,
  };
}

export type EditKind = 'in_place' | 'replace' | 'locked';

const nul = (v: string | null | undefined): string | null => (v === undefined ? null : v);
const emptyToNull = (v: string | null | undefined): string | null => (v ? v : null);

/**
 * AC-14 / AC-15 / EC-6 — how a PATCH applies, compared against the STORED case
 * so an unchanged field the client echoes back is never a change.
 *   - case with a source finding: only name / notes may differ → else `locked`;
 *   - manual case: a changed diff, file, lines, type, PR title or description
 *     → `replace`; a changed name / notes / severity / category alone → `in_place`.
 */
export function classifyEdit(
  existing: Pick<EvalCaseRow, 'inputDiff' | 'inputMeta' | 'expectedOutput' | 'sourceFindingId'>,
  update: EvalCaseUpdate,
): EditKind {
  const stored = existing.expectedOutput;
  const exp = update.expectation;
  const file = exp?.file ?? stored.file;

  const diffChanged =
    update.input_diff !== undefined && !diffUnchanged(existing.inputDiff, update.input_diff, file);
  const metaChanged =
    update.input_meta !== undefined &&
    (update.input_meta.title !== existing.inputMeta.title ||
      emptyToNull(update.input_meta.body) !== emptyToNull(existing.inputMeta.body));
  const inputChanged =
    diffChanged ||
    metaChanged ||
    (exp !== undefined &&
      (exp.file !== stored.file ||
        exp.start_line !== stored.start_line ||
        exp.end_line !== stored.end_line ||
        exp.type !== stored.type));

  if (existing.sourceFindingId) {
    const qualifiersChanged =
      exp !== undefined &&
      (nul(exp.severity) !== nul(stored.severity) || nul(exp.category) !== nul(stored.category));
    return inputChanged || qualifiersChanged ? 'locked' : 'in_place';
  }
  return inputChanged ? 'replace' : 'in_place';
}

/** Whether a PATCH body carries at least one editable field (empty body → 422). */
export function hasUpdateFields(update: EvalCaseUpdate): boolean {
  return Object.values(update).some((v) => v !== undefined);
}
