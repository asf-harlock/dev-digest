import type { AgentColumn, MultiAgentRun } from '@devdigest/shared';
import type { LatestMultiAgentRunRows, MultiAgentChildRows } from '../repository/multi-agent.repo.js';
import { findingRowToDto } from '../helpers.js';
import { COLUMN_STATUSES } from '../constants.js';
import { computeConflicts } from './conflicts.js';

/**
 * Assembles the `MultiAgentRun` snapshot from stored rows (AC-16, AC-17).
 * Everything here is derived at read time — nothing is stored (NFR-3).
 */

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function columnStatus(status: string | null): AgentColumn['status'] {
  return (COLUMN_STATUSES as readonly string[]).includes(status ?? '')
    ? (status as AgentColumn['status'])
    : 'failed';
}

function toColumn(child: MultiAgentChildRows): AgentColumn {
  const { run, review } = child;
  return {
    run_id: run.id,
    agent_id: run.agentId,
    agent_name: child.agentName,
    provider: run.provider,
    model: run.model,
    status: columnStatus(run.status),
    error: run.error,
    verdict: review?.verdict ?? null,
    score: run.score,
    summary: review?.summary ?? null,
    duration_ms: run.durationMs,
    cost_usd: run.costUsd,
    findings: child.findings.map(findingRowToDto),
  };
}

/** Agent name, then run id; columns of a deleted agent (null name) go last (A3). */
function compareColumns(a: AgentColumn, b: AgentColumn): number {
  if (a.agent_name === null && b.agent_name !== null) return 1;
  if (a.agent_name !== null && b.agent_name === null) return -1;
  return cmp(a.agent_name ?? '', b.agent_name ?? '') || cmp(a.run_id, b.run_id);
}

/** Known child costs summed; null when none is known. */
function totalCost(columns: AgentColumn[]): number | null {
  const known = columns.flatMap((c) => (c.cost_usd === null ? [] : [c.cost_usd]));
  return known.length === 0 ? null : known.reduce((sum, c) => sum + c, 0);
}

/**
 * max(ran_at + duration_ms) − min(ran_at) over the children; `now` stands in for
 * the max while any child is still running (AC-17, Q-24).
 */
function totalDurationMs(children: MultiAgentChildRows[], now: number): number {
  if (children.length === 0) return 0;
  const starts = children.map((c) => c.run.ranAt.getTime());
  const anyRunning = children.some((c) => columnStatus(c.run.status) === 'running');
  const end = anyRunning
    ? now
    : Math.max(...children.map((c) => c.run.ranAt.getTime() + (c.run.durationMs ?? 0)));
  return Math.max(0, Math.round(end - Math.min(...starts)));
}

export function buildMultiAgentRun(rows: LatestMultiAgentRunRows, now: number): MultiAgentRun {
  const columns = rows.children.map(toColumn).sort(compareColumns);
  const done = columns.filter((c) => c.status === 'done');
  return {
    id: rows.multiAgentRun.id,
    pr_id: rows.multiAgentRun.prId,
    pr_number: rows.prNumber,
    ran_at: rows.multiAgentRun.ranAt.toISOString(),
    agent_count: columns.length,
    total_duration_ms: totalDurationMs(rows.children, now),
    total_cost_usd: totalCost(columns),
    columns,
    conflicts: computeConflicts(done),
  };
}
