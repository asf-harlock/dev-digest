/**
 * Shared by `run_agent_on_pr` and `get_findings` — both tools end up polling
 * a run and shaping the same `{status, verdict, findings, …}` result.
 */
import { z } from 'zod';
import type { RunSummary } from '@devdigest/shared';
import { UNTRUSTED_NOTE, wrapUntrusted } from '../security.js';
import type { ToolDeps } from '../server.js';
import type {
  ReviewDtoLite,
  ReviewDtoLiteFinding,
  ReviewResult,
  ReviewResultCounts,
  ReviewResultFinding,
} from '../types.js';

export interface WaitForRunExtra {
  progressToken?: string | number;
  sendNotification: (notification: unknown) => Promise<void>;
}

/** `limit` default/ceiling shared by both tools' input schemas, so the two
 *  never drift apart. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

const SEVERITY_VALUES = ['CRITICAL', 'WARNING', 'SUGGESTION'] as const;
const CATEGORY_VALUES = ['bug', 'security', 'perf', 'style', 'test'] as const;

// Duplicated (not imported) on purpose — `@devdigest/shared` zod schemas are
// runtime values, and mcp/ only takes TYPE-only imports from that package
// (root CLAUDE.md gotcha; see mcp/CLAUDE.md). Keep in sync with
// `server/src/vendor/shared/contracts/findings.ts`.
const SEVERITY_RANK: Record<(typeof SEVERITY_VALUES)[number], number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

/** The `outputSchema` raw shape both `run_agent_on_pr` and `get_findings`
 *  register — kept here so the two tools can never disagree on its shape. */
export const reviewResultOutputSchema = {
  status: z.enum(['done', 'running', 'failed', 'cancelled']),
  run_id: z.string(),
  verdict: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  counts: z
    .object({
      CRITICAL: z.number().int(),
      WARNING: z.number().int(),
      SUGGESTION: z.number().int(),
    })
    .optional(),
  total: z.number().int().optional(),
  truncated: z.boolean().optional(),
  findings: z
    .array(
      z.object({
        severity: z.enum(SEVERITY_VALUES),
        category: z.enum(CATEGORY_VALUES),
        title: z.string(),
        file: z.string(),
        start_line: z.number().int(),
        end_line: z.number().int(),
        rationale: z.string(),
        suggestion: z.string().nullable().optional(),
        confidence: z.number(),
      }),
    )
    .optional(),
  note: z.string().optional(),
  error: z.string().optional(),
};

/**
 * Turns a `RunSummary` + (when `done`) its `ReviewDtoLite` into the flat
 * `{status, verdict, findings, …}` result both tools return. Free text
 * (`title`, `rationale`, `suggestion`) is wrapped with `wrapUntrusted` before
 * it reaches the caller — it originates in the PR / an LLM's own output.
 */
export function shapeReviewResult(
  run: RunSummary,
  review: ReviewDtoLite | null,
  opts: { includeDismissed: boolean; limit: number },
  nonce: string,
): ReviewResult {
  if (run.status === 'failed' || run.status === 'cancelled') {
    // A run's error can echo model output (e.g. a zod parse issue quoting the
    // value the LLM produced), so it is untrusted text like any finding field.
    if (!run.error) {
      return {
        status: run.status,
        run_id: run.run_id,
        error: 'The run ended with no recorded error message.',
      };
    }
    return {
      status: run.status,
      run_id: run.run_id,
      error: wrapUntrusted(run.error, nonce),
      note: UNTRUSTED_NOTE,
    };
  }

  if (run.status !== 'done' || !review) {
    return {
      status: 'running',
      run_id: run.run_id,
      note: 'Run still in progress — call get_findings(run_id) again shortly.',
    };
  }

  const scoped = opts.includeDismissed
    ? review.findings
    : review.findings.filter((f) => f.dismissed_at === null);
  const sorted = [...scoped].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );

  const total = sorted.length;
  const page = sorted.slice(0, opts.limit);
  const truncated = total > page.length;
  const findings = page.map((f) => wrapFinding(f, nonce));

  return {
    status: 'done',
    run_id: run.run_id,
    verdict: review.verdict,
    score: review.score,
    counts: countBySeverity(scoped),
    total,
    truncated,
    findings,
    // Only the plan's UNTRUSTED_NOTE, and only when there is untrusted text
    // in the result for it to apply to — an empty findings page has none.
    ...(findings.length > 0 ? { note: UNTRUSTED_NOTE } : {}),
  };
}

function wrapFinding(f: ReviewDtoLiteFinding, nonce: string): ReviewResultFinding {
  return {
    severity: f.severity,
    category: f.category,
    title: wrapUntrusted(f.title, nonce),
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    rationale: wrapUntrusted(f.rationale, nonce),
    suggestion: f.suggestion ? wrapUntrusted(f.suggestion, nonce) : f.suggestion,
    confidence: f.confidence,
  };
}

function countBySeverity(findings: ReviewDtoLiteFinding[]): ReviewResultCounts {
  const counts: ReviewResultCounts = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/** One short, JSON-free line for clients that only render `content`, not
 *  `structuredContent`. */
export function summarizeReviewResult(result: ReviewResult): string {
  switch (result.status) {
    case 'running':
      return `Run ${result.run_id} is still running — call get_findings again shortly.`;
    case 'failed':
    case 'cancelled':
      return `Run ${result.run_id} ${result.status}: ${result.error ?? 'no error message recorded'}.`;
    case 'done': {
      const total = result.total ?? 0;
      const shown = result.findings?.length ?? total;
      const noun = total === 1 ? 'finding' : 'findings';
      const shownNote = result.truncated ? ` (showing ${shown})` : '';
      return `${result.verdict ?? 'no verdict'} (score ${result.score ?? '—'}) — ${total} ${noun}${shownNote}.`;
    }
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bounded poll of `GET /runs/:id` — checks immediately, then every
 * `deps.config.pollIntervalMs` until either the run leaves `running` or
 * `deps.config.runTimeoutMs` elapses since the first check, whichever comes
 * first. On timeout, returns the last (still-`running`) `RunSummary` rather
 * than throwing, so the caller can hand the client a `run_id` to retry with.
 * `deps.sleep`/`deps.now` are injectable so tests never wait in real time.
 */
export async function waitForRun(
  deps: ToolDeps,
  runId: string,
  extra?: WaitForRunExtra,
): Promise<RunSummary> {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;
  const start = now();
  const deadline = start + deps.config.runTimeoutMs;

  for (;;) {
    const run = await deps.api.getRun(runId);
    if (run.status !== 'running') return run;
    if (now() >= deadline) return run;

    if (extra?.progressToken !== undefined) {
      await extra.sendNotification({
        method: 'notifications/progress',
        params: {
          progressToken: extra.progressToken,
          progress: now() - start,
          total: deps.config.runTimeoutMs,
          message: `Waiting for run ${runId} to finish…`,
        },
      });
    }

    await sleep(deps.config.pollIntervalMs);
  }
}
