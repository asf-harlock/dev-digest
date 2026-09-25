/**
 * Local MCP-side types. Only TYPE-only imports come from `@devdigest/shared`
 * (per the root CLAUDE.md gotcha, `mcp/` never adds a runtime import on the
 * server's vendored contracts — that would couple this package to server
 * internals at runtime instead of just at the type level).
 */
import type { FindingCategory, Severity } from '@devdigest/shared';

/**
 * Mirrors the subset of `ReviewDto` (`server/src/modules/reviews/helpers.ts`)
 * that the MCP tools need. Deliberately narrower than the server's DTO.
 */
export interface ReviewDtoLiteFinding {
  severity: Severity;
  category: FindingCategory;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
  dismissed_at: string | null;
}

export interface ReviewDtoLite {
  run_id: string | null;
  verdict: string | null;
  summary: string | null;
  score: number | null;
  findings: ReviewDtoLiteFinding[];
}

/** Per-severity finding counts, uppercase keys — matches the server's
 *  `PrMeta.findings_counts` convention (`server/src/vendor/shared/contracts/platform.ts`). */
export interface ReviewResultCounts {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
}

export interface ReviewResultFinding {
  severity: Severity;
  category: FindingCategory;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  rationale: string;
  suggestion?: string | null;
  confidence: number;
}

/**
 * The shape shared by `run_agent_on_pr` and `get_findings`
 * (`shapeReviewResult` in `tools/review-result.ts`).
 */
export interface ReviewResult {
  // The SDK types `CallToolResult.structuredContent` as `Record<string,
  // unknown>` (it's transported as a JSON-RPC object field, not a known
  // shape) — this index signature is what makes `ReviewResult` assignable
  // there. Every named field below is still fully typed for callers.
  [key: string]: unknown;
  status: 'done' | 'running' | 'failed' | 'cancelled';
  run_id: string;
  verdict?: string | null;
  score?: number | null;
  counts?: ReviewResultCounts;
  total?: number;
  truncated?: boolean;
  findings?: ReviewResultFinding[];
  note?: string;
  /** Set only on `status: 'failed' | 'cancelled'` — the run's recorded error. */
  error?: string;
}
