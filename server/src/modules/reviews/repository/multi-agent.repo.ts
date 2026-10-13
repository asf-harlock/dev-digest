import { and, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { AgentRunRow, FindingRow } from '../../../db/rows.js';

// ---- multi-agent runs (specs/11-multi-agent-review.md) ---------------------
// Every query here is scoped by `workspace_id` (NFR-2). Nothing derived is
// stored (NFR-3): the parent row is just an id + the PR + a timestamp.

export type MultiAgentRunRow = typeof t.multiAgentRuns.$inferSelect;

/** One child run of a multi-agent run, with everything its column needs. */
export interface MultiAgentChildRows {
  run: AgentRunRow;
  /** Current agent name; null when the agent was deleted (`agent_id` is null). */
  agentName: string | null;
  /** The run's review, when it produced one (a running/failed run has none). */
  review: { verdict: string | null; summary: string | null } | null;
  findings: FindingRow[];
}

/** The latest multi-agent run of a PR, as stored rows (the service maps it to the contract). */
export interface LatestMultiAgentRunRows {
  multiAgentRun: MultiAgentRunRow;
  /** `pull_requests.number` of the run's PR. */
  prNumber: number | null;
  children: MultiAgentChildRows[];
}

/** One finished run, as the estimates see it. */
export interface DoneRunSample {
  agentId: string;
  durationMs: number | null;
  costUsd: number | null;
}

/**
 * Create a multi-agent run and one `running` `agent_runs` row per agent in ONE
 * transaction (AC-13): either the group and all its children exist, or none.
 * Returns the child run ids paired with their agent, in input order.
 */
export async function createMultiAgentRun(
  db: Db,
  values: {
    workspaceId: string;
    prId: string;
    agents: { agentId: string; provider: string | null; model: string | null }[];
  },
): Promise<{ multiAgentRunId: string; runs: { runId: string; agentId: string }[] }> {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .insert(t.multiAgentRuns)
      .values({ workspaceId: values.workspaceId, prId: values.prId })
      .returning({ id: t.multiAgentRuns.id });
    const multiAgentRunId = group!.id;

    const inserted = await tx
      .insert(t.agentRuns)
      .values(
        values.agents.map((a) => ({
          workspaceId: values.workspaceId,
          agentId: a.agentId,
          prId: values.prId,
          provider: a.provider,
          model: a.model,
          status: 'running',
          source: 'local' as const,
          multiAgentRunId,
        })),
      )
      .returning({ id: t.agentRuns.id, agentId: t.agentRuns.agentId });

    // `returning` order is not guaranteed to match the VALUES order; key by agent.
    const runIdByAgent = new Map(inserted.map((r) => [r.agentId, r.id]));
    return {
      multiAgentRunId,
      runs: values.agents.map((a) => ({ runId: runIdByAgent.get(a.agentId)!, agentId: a.agentId })),
    };
  });
}

/**
 * True when the PR has a `running` child of ANY multi-agent run (EC-5). A
 * standalone single-agent run has `multi_agent_run_id IS NULL` and never counts.
 */
export async function hasRunningMultiAgentChild(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: t.agentRuns.id })
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.prId, prId),
        isNotNull(t.agentRuns.multiAgentRunId),
        eq(t.agentRuns.status, 'running'),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * The PR's latest multi-agent run (greatest `ran_at`) with its child runs, their
 * agent names, reviews and findings. `undefined` when the PR has none. Children
 * deleted via `DELETE /runs/:id` are simply absent (the FK sets null on the
 * other side, but the child row itself is gone).
 */
export async function latestMultiAgentRun(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<LatestMultiAgentRunRows | undefined> {
  const [head] = await db
    .select({ multiAgentRun: t.multiAgentRuns, prNumber: t.pullRequests.number })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
    .orderBy(desc(t.multiAgentRuns.ranAt))
    .limit(1);
  if (!head) return undefined;

  const childRows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.multiAgentRunId, head.multiAgentRun.id),
      ),
    );
  if (childRows.length === 0) {
    return { multiAgentRun: head.multiAgentRun, prNumber: head.prNumber, children: [] };
  }

  // `findings` has no workspace_id of its own — scope through `reviews`.
  const runIds = childRows.map((c) => c.run.id);
  const reviews = await db
    .select()
    .from(t.reviews)
    .where(and(eq(t.reviews.workspaceId, workspaceId), inArray(t.reviews.runId, runIds)))
    .orderBy(desc(t.reviews.createdAt));
  const findingRows =
    reviews.length === 0
      ? []
      : await db
          .select()
          .from(t.findings)
          .where(inArray(t.findings.reviewId, reviews.map((r) => r.id)));

  const children: MultiAgentChildRows[] = childRows.map(({ run, agentName }) => {
    // Newest review per run (reviews are ordered newest first).
    const review = reviews.find((r) => r.runId === run.id);
    return {
      run,
      agentName: agentName ?? null,
      review: review ? { verdict: review.verdict, summary: review.summary } : null,
      findings: review ? findingRows.filter((f) => f.reviewId === review.id) : [],
    };
  });
  return { multiAgentRun: head.multiAgentRun, prNumber: head.prNumber, children };
}

/**
 * The last `limit` `done` runs of every agent in the workspace, on any PR and
 * from any source (`ci` included, AC-5). One query, ranked per agent with a
 * window function; runs whose agent was deleted (`agent_id IS NULL`) are skipped.
 */
export async function lastDoneRunsPerAgent(
  db: Db,
  workspaceId: string,
  limit: number,
): Promise<DoneRunSample[]> {
  const ranked = db
    .select({
      agentId: t.agentRuns.agentId,
      durationMs: t.agentRuns.durationMs,
      costUsd: t.agentRuns.costUsd,
      rank: sql<number>`row_number() over (partition by ${t.agentRuns.agentId} order by ${t.agentRuns.ranAt} desc, ${t.agentRuns.id} desc)`.as(
        'rank',
      ),
    })
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.status, 'done'),
        isNotNull(t.agentRuns.agentId),
      ),
    )
    .as('ranked');

  const rows = await db
    .select({ agentId: ranked.agentId, durationMs: ranked.durationMs, costUsd: ranked.costUsd })
    .from(ranked)
    .where(lte(ranked.rank, limit));
  return rows.flatMap((r) =>
    r.agentId === null ? [] : [{ agentId: r.agentId, durationMs: r.durationMs, costUsd: r.costUsd }],
  );
}
