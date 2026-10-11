import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalCaseOutcome, EvalCaseEffect, Conformance, Provider } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalCase` + per-case shapes, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — runs, overview, dashboard, compare (SPEC-08)
//
// Case-side shapes (EvalCase, EvalExpectation, EvalCaseOutcome, …) live in
// `knowledge.ts`. No `.default()` here: both vendor copies stay identical.
// ===========================================================================

export const EvalRunStatus = z.enum(['running', 'completed', 'partial', 'errored']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

/** Everything the run froze about the agent at start; survives later agent edits. */
export const EvalRunSnapshot = z.object({
  provider: Provider,
  model: z.string(),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']),
  system_prompt: z.string(),
  skills: z.array(z.object({ name: z.string(), body: z.string() })),
});
export type EvalRunSnapshot = z.infer<typeof EvalRunSnapshot>;

/** A case as it was in the run's case set (survives case deletion). */
export const EvalCaseRef = z.object({
  id: z.string(),
  name: z.string(),
});
export type EvalCaseRef = z.infer<typeof EvalCaseRef>;

/** `value` is null when the denominator (`den`) is 0. */
export const EvalRatio = z.object({
  value: z.number().nullable(),
  num: z.number().int(),
  den: z.number().int(),
});
export type EvalRatio = z.infer<typeof EvalRatio>;

export const EvalMetrics = z.object({
  recall: EvalRatio,
  precision: EvalRatio,
  citation_accuracy: EvalRatio,
  tp: z.number().int(),
  fp: z.number().int(),
  unlabeled: z.number().int(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  cases_errored: z.number().int(),
});
export type EvalMetrics = z.infer<typeof EvalMetrics>;

/** One eval run. `metrics` is null while running and when no case could be scored. */
export const EvalRunRecord = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string().nullable(),
  status: EvalRunStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  agent_version: z.number().int(),
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  metrics: EvalMetrics.nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  error_reason: z.string().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** An agent run's full detail. `owner_kind` discriminates it from a skill run (SPEC-09). */
export const EvalAgentRunDetail = EvalRunRecord.extend({
  owner_kind: z.literal('agent'),
  snapshot: EvalRunSnapshot,
  case_set: z.array(EvalCaseRef),
  case_results: z.array(EvalCaseOutcome),
});
export type EvalAgentRunDetail = z.infer<typeof EvalAgentRunDetail>;

// ---- Eval — skill runs (SPEC-09) ----

/** Raw lift per metric: with-skill fraction minus without-skill fraction, unrounded. Null when either side is null. */
export const EvalLift = z.object({
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalLift = z.infer<typeof EvalLift>;

/** The agent a skill run was executed through. */
export const EvalSkillRunCarrier = z.object({
  agent_id: z.string(),
  name: z.string(),
  version: z.number().int(),
  model: z.string(),
});
export type EvalSkillRunCarrier = z.infer<typeof EvalSkillRunCarrier>;

/** One skill eval run: the with-skill arm and the without-skill arm of the same case set. */
export const EvalSkillRunRecord = z.object({
  id: z.string(),
  owner_kind: z.literal('skill'),
  skill_id: z.string(),
  skill_name: z.string(),
  skill_version: z.number().int(),
  carrier: EvalSkillRunCarrier,
  status: EvalRunStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_done: z.number().int(),
  with: EvalMetrics.nullable(),
  without: EvalMetrics.nullable(),
  lift: EvalLift.nullable(),
  /** Summed over both arms. */
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  error_reason: z.string().nullable(),
});
export type EvalSkillRunRecord = z.infer<typeof EvalSkillRunRecord>;

/** Everything a skill run froze at start; survives later skill / agent edits. */
export const EvalSkillRunSnapshot = z.object({
  carrier: z.object({
    agent_id: z.string(),
    name: z.string(),
    version: z.number().int(),
    provider: Provider,
    model: z.string(),
    strategy: z.enum(['auto', 'single-pass', 'map-reduce']),
    system_prompt: z.string(),
  }),
  skill: z.object({ name: z.string(), body: z.string(), version: z.number().int() }),
  with_skills: z.array(z.object({ name: z.string(), body: z.string() })),
  without_skills: z.array(z.object({ name: z.string(), body: z.string() })),
});
export type EvalSkillRunSnapshot = z.infer<typeof EvalSkillRunSnapshot>;

/** A case's result in both arms of a skill run, with its effect. */
export const EvalSkillCaseResult = z.object({
  case_id: z.string(),
  case_name: z.string(),
  with: EvalCaseOutcome,
  without: EvalCaseOutcome,
  effect: EvalCaseEffect,
});
export type EvalSkillCaseResult = z.infer<typeof EvalSkillCaseResult>;

export const EvalSkillRunDetail = EvalSkillRunRecord.extend({
  snapshot: EvalSkillRunSnapshot,
  case_set: z.array(EvalCaseRef),
  case_results: z.array(EvalSkillCaseResult),
});
export type EvalSkillRunDetail = z.infer<typeof EvalSkillRunDetail>;

/** `GET /eval-runs/:id` — discriminated by `owner_kind`. */
export const EvalRunDetail = z.discriminatedUnion('owner_kind', [
  EvalAgentRunDetail,
  EvalSkillRunDetail,
]);
export type EvalRunDetail = z.infer<typeof EvalRunDetail>;

/** `POST /skills/:id/eval-runs` body. */
export const SkillEvalRunRequest = z.object({
  carrier_agent_id: z.string().uuid(),
});
export type SkillEvalRunRequest = z.infer<typeof SkillEvalRunRequest>;
/** Plan name for `SkillEvalRunRequest`; same schema. */
export const EvalSkillRunRequest = SkillEvalRunRequest;
export type EvalSkillRunRequest = SkillEvalRunRequest;

/** `recall` / `precision` / `citation_accuracy` are the with-skill arm; null is a gap in the chart. */
export const EvalSkillTrendPoint = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  skill_version: z.number().int(),
  carrier_agent_id: z.string(),
  carrier_name: z.string(),
  carrier_version: z.number().int(),
  model: z.string(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  lift: EvalLift,
  cost_usd: z.number().nullable(),
});
export type EvalSkillTrendPoint = z.infer<typeof EvalSkillTrendPoint>;

/** An agent linked to the skill — a possible carrier for a run. */
export const EvalSkillCarrier = z.object({
  agent_id: z.string(),
  name: z.string(),
  version: z.number().int(),
  model: z.string(),
  enabled: z.boolean(),
  link_enabled: z.boolean(),
});
export type EvalSkillCarrier = z.infer<typeof EvalSkillCarrier>;

/** `GET /skills/:id/eval-overview`. `trend` <= 100 chronological. */
export const EvalSkillOverview = z.object({
  skill: z.object({
    id: z.string(),
    name: z.string(),
    version: z.number().int(),
    enabled: z.boolean(),
  }),
  cases_total: z.number().int(),
  running_run_id: z.string().nullable(),
  carriers: z.array(EvalSkillCarrier),
  latest: EvalSkillRunRecord.nullable(),
  previous: EvalSkillRunRecord.nullable(),
  trend: z.array(EvalSkillTrendPoint),
});
export type EvalSkillOverview = z.infer<typeof EvalSkillOverview>;

/** `POST /agents/:id/eval-runs` → 202. */
export const EvalRunStart = z.object({
  id: z.string(),
  status: z.literal('running'),
});
export type EvalRunStart = z.infer<typeof EvalRunStart>;

/** A null metric is a gap in the chart, not 0. */
export const EvalTrendPoint = z.object({
  run_id: z.string(),
  ran_at: z.string(),
  agent_version: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** `GET /agents/:id/eval-overview`. `trend` <= 100 chronological; `runs` <= 50 newest first. */
export const EvalOverview = z.object({
  agent: z.object({
    id: z.string(),
    name: z.string(),
    model: z.string(),
    enabled: z.boolean(),
  }),
  cases_total: z.number().int(),
  finished_runs: z.number().int(),
  running_run_id: z.string().nullable(),
  latest: EvalRunRecord.nullable(),
  previous: EvalRunRecord.nullable(),
  trend: z.array(EvalTrendPoint),
  runs: z.array(EvalRunRecord),
});
export type EvalOverview = z.infer<typeof EvalOverview>;

/** `sparkline` is recall, <= 10 points, chronological; null is a gap. */
export const EvalAgentSummary = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  cases_total: z.number().int(),
  latest: EvalRunRecord.nullable(),
  sparkline: z.array(z.number().nullable()),
});
export type EvalAgentSummary = z.infer<typeof EvalAgentSummary>;

/** `GET /eval-dashboard`. `recent_runs` <= 20. */
export const EvalDashboard = z.object({
  agents: z.array(EvalAgentSummary),
  recent_runs: z.array(EvalRunRecord),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ---- Eval — compare ----

/** `GET /eval-runs/compare?a&b`. */
export const EvalCompareQuery = z.object({
  a: z.string().uuid(),
  b: z.string().uuid(),
});
export type EvalCompareQuery = z.infer<typeof EvalCompareQuery>;

export const EvalCompareRatios = z.object({
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalCompareRatios = z.infer<typeof EvalCompareRatios>;

/** `old` is the run with the earlier `started_at`. The server returns no deltas. */
export const EvalCompare = z.object({
  old: EvalRunRecord,
  new: EvalRunRecord,
  common_cases: z.number().int(),
  only_old: z.number().int(),
  only_new: z.number().int(),
  common: z.object({ old: EvalCompareRatios, new: EvalCompareRatios }),
  prompt_diff: z.array(
    z.object({ kind: z.enum(['added', 'removed', 'context']), text: z.string() }),
  ),
  prompt_changed: z.boolean(),
  skills_diff: z.object({
    added: z.array(z.string()),
    removed: z.array(z.string()),
    changed: z.array(z.string()),
  }),
  model_change: z.object({ from: z.string(), to: z.string() }).nullable(),
  strategy_change: z.object({ from: z.string(), to: z.string() }).nullable(),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
