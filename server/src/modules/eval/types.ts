import type { EvalExpectation, EvalMetrics } from '@devdigest/shared';

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
