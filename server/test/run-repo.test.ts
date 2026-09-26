import { describe, it, expect } from 'vitest';
import type { AgentRunRow } from '../src/db/rows.js';
import { toRunSummary } from '../src/modules/reviews/repository/run.repo.js';

/**
 * `toRunSummary` is the mapping `listRunsForPull` (GET /pulls/:id/runs) and
 * `getRunSummary` (GET /runs/:id) now share, so a drift between the two
 * routes' response shapes would show up here first. Hermetic — a plain
 * `AgentRunRow` fixture, no DB.
 */
function mkRun(over: Partial<AgentRunRow> = {}): AgentRunRow {
  return {
    id: 'run-1',
    workspaceId: 'ws-1',
    agentId: 'agent-1',
    prId: 'pr-1',
    ranAt: new Date('2026-01-01T00:00:00.000Z'),
    provider: 'openai',
    model: 'gpt-4.1',
    durationMs: 1234,
    tokensIn: 100,
    tokensOut: 50,
    costUsd: 0.01,
    status: 'done',
    error: null,
    source: 'local',
    findingsCount: 2,
    grounding: '2/2 passed',
    score: 87,
    blockers: 1,
    ...over,
  };
}

describe('toRunSummary', () => {
  it('maps every agent_runs column onto the RunSummary contract', () => {
    expect(toRunSummary(mkRun(), 'Security Reviewer')).toEqual({
      run_id: 'run-1',
      agent_id: 'agent-1',
      agent_name: 'Security Reviewer',
      provider: 'openai',
      model: 'gpt-4.1',
      status: 'done',
      error: null,
      duration_ms: 1234,
      tokens_in: 100,
      tokens_out: 50,
      cost_usd: 0.01,
      findings_count: 2,
      grounding: '2/2 passed',
      ran_at: '2026-01-01T00:00:00.000Z',
      score: 87,
      blockers: 1,
    });
  });

  it('a null/undefined agent name (no join match, or agent deleted) maps to null, never undefined', () => {
    expect(toRunSummary(mkRun(), null).agent_name).toBeNull();
  });

  it('a run still running (or failed) has null score/blockers, per the completeAgentRun contract', () => {
    const run = mkRun({ status: 'running', score: null, blockers: null, findingsCount: null });
    const summary = toRunSummary(run, null);
    expect(summary.score).toBeNull();
    expect(summary.blockers).toBeNull();
    expect(summary.status).toBe('running');
  });
});
