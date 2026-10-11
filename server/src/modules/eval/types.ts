import type { EvalExpectation, EvalLift, EvalMetrics } from '@devdigest/shared';

/** Pino-compatible subset: Fastify's `req.log` / `app.log` satisfy it. */
export interface EvalLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/**
 * A run as read by list queries: scalar columns only. The `snapshot`,
 * `case_set` and `case_results` jsonb are never part of it (NFR-13);
 * `casesTotal` / `casesDone` are computed in SQL from their lengths.
 */
export interface EvalRunSummary {
  id: string;
  agentId: string;
  status: 'running' | 'completed' | 'partial' | 'errored';
  ranAt: Date;
  finishedAt: Date | null;
  agentVersion: number;
  casesTotal: number;
  casesDone: number;
  metrics: EvalMetrics | null;
  durationMs: number | null;
  costUsd: number | null;
  errorReason: string | null;
}

/**
 * A skill run as read by overview queries (SPEC-09 NFR-13): scalar columns, the
 * small aggregate jsonb (`metric_parts`, `without_metrics`, `lift`) and the two
 * jsonb lengths computed in SQL. Never `snapshot`, `skill_snapshot`, `case_set`
 * or the per-case results.
 */
export interface EvalSkillRunSummary {
  id: string;
  skillId: string;
  skillVersion: number;
  carrierAgentId: string;
  carrierName: string;
  carrierVersion: number;
  carrierModel: string;
  status: 'running' | 'completed' | 'partial' | 'errored';
  ranAt: Date;
  finishedAt: Date | null;
  casesTotal: number;
  casesDone: number;
  withMetrics: EvalMetrics | null;
  withoutMetrics: EvalMetrics | null;
  lift: EvalLift | null;
  durationMs: number | null;
  costUsd: number | null;
  errorReason: string | null;
}

/** One finished skill run as the trend reads it: scalar columns only (NFR-13). */
export interface EvalSkillTrendRow {
  id: string;
  ranAt: Date;
  skillVersion: number;
  carrierAgentId: string;
  carrierName: string;
  carrierVersion: number;
  carrierModel: string;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  lift: EvalLift | null;
  costUsd: number | null;
}

/** A carrier candidate: an agent of the workspace linked to the skill. */
export interface CarrierRow {
  agentId: string;
  name: string;
  version: number;
  model: string;
  enabled: boolean;
  linkEnabled: boolean;
}

/** The skill under test, read at run start. */
export interface SkillForRun {
  id: string;
  name: string;
  body: string;
  version: number;
  enabled: boolean;
}

/** Everything `createFromFinding` needs, read in one go (finding → review → pull → repo → agent). */
export interface FindingCaseContext {
  finding: {
    id: string;
    file: string;
    startLine: number;
    endLine: number;
    severity: string;
    category: string;
    title: string;
    kind: string;
    acceptedAt: Date | null;
    dismissedAt: Date | null;
  };
  /** `reviews.agent_id`; null when the review has none. */
  agentId: string | null;
  /** Whether that agent still exists in the workspace. */
  agentExists: boolean;
  pull: {
    id: string;
    number: number;
    title: string;
    body: string | null;
    base: string;
    headSha: string;
  };
  repo: { owner: string; name: string; fullName: string };
}

/** The slice of a case a run needs, read once at run start (EC-18). */
export interface FrozenCase {
  id: string;
  name: string;
  inputDiff: string;
  inputMeta: { title: string; body: string | null };
  expectation: EvalExpectation;
}
