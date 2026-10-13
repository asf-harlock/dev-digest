import { z } from 'zod';
import { Severity } from './findings.js';
import { FindingRecord } from './review-api.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - MultiAgentRunRequest / MultiAgentEstimates  its request and the estimates feed
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/**
 * A finding as surfaced in a multi-agent column. SPEC-11 Q-18: a superset of
 * `FindingRecord` (it IS `FindingRecord`) so one snapshot feeds both the
 * `FindingCard` and the `RunTraceDrawer` — no second findings endpoint.
 */
export const AgentColumnFinding = FindingRecord;
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  /** Null when the agent was deleted after the run (the run row outlives it). */
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['done', 'failed', 'running', 'cancelled']),
  /** Failure reason when status is 'failed' / 'cancelled'; null otherwise. */
  error: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a grouped location. Keyed by `run_id`. */
export const ConflictTake = z.object({
  /** The column (agent run) this take belongs to. */
  run_id: z.string(),
  /** Null when the agent was deleted after the run. */
  agent_id: z.string().nullable(),
  persona: z.string().nullable(),
  /** Severity if the agent flagged it, or 'ignored' when it did not. */
  verdict: z.union([Severity, z.literal('ignored')]),
  note: z.string(),
  /** True when the representative finding of this take was dismissed. */
  dismissed: z.boolean(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A group of findings from different agents that overlap on the same file
 * lines (or the same file for file-scoped kinds). A group is not always a
 * disagreement: `contended` marks the ones where the agents differ (one flagged
 * and another did not, or severities diverge); the UI filters on it. Computed
 * from persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  contended: z.boolean(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** Body of POST /pulls/:id/multi-agent-run. */
export const MultiAgentRunRequest = z.object({
  agentIds: z.array(z.string().uuid()).min(1),
});
export type MultiAgentRunRequest = z.infer<typeof MultiAgentRunRequest>;

/** Median of an agent's last done runs; null fields mean "no data" (UI shows "—"). */
export const AgentEstimate = z.object({
  agent_id: z.string(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  runs_used: z.number().int(),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;

/** Response of GET /multi-agent/estimates. */
export const MultiAgentEstimates = z.object({
  agents: z.array(AgentEstimate),
});
export type MultiAgentEstimates = z.infer<typeof MultiAgentEstimates>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
