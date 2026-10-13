import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AgentColumn,
  AgentEstimate,
  Conflict,
  MultiAgentEstimates,
  MultiAgentRun,
  MultiAgentRunRequest,
  RunSummary,
} from '@devdigest/shared';
import { MULTI_AGENT_CONCURRENCY, MULTI_AGENT_RATE_LIMIT } from '../src/modules/reviews/constants.js';

/**
 * SPEC-11 contracts. Two jobs:
 *  1. the new shapes accept what the API sends and reject what it must not
 *     accept (the request body is the 422 of EC-2);
 *  2. NFR-7 — `@devdigest/shared` exists in TWO physical copies (server + client
 *     vendor), so the SPEC-11 regions are compared between them. Fields that carry
 *     `.default()` in the server copy are `.optional()` in the client copy, so the
 *     comparison normalises exactly that and nothing else.
 */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const SERVER = '../src/vendor/shared/contracts/';
const CLIENT = '../../client/src/vendor/shared/contracts/';

const UUID = '3f2b8c1e-5d4a-4b7e-9c1a-0d2e3f4a5b6c';

const finding = {
  id: 'f-1',
  severity: 'CRITICAL',
  category: 'security',
  title: 'Hardcoded key',
  file: 'src/config.ts',
  start_line: 11,
  end_line: 11,
  rationale: 'A live key is committed.',
  suggestion: null,
  confidence: 0.9,
  kind: 'finding',
  review_id: 'rev-1',
  accepted_at: null,
  dismissed_at: null,
};

const column = {
  run_id: 'run-1',
  agent_id: 'agent-1',
  agent_name: 'Security',
  provider: 'openai',
  model: 'gpt-4.1',
  status: 'done',
  error: null,
  verdict: 'request_changes',
  score: 65,
  summary: 'One problem.',
  duration_ms: 1200,
  cost_usd: 0.001,
  findings: [finding],
};

describe('SPEC-11 contracts: parsing', () => {
  it('AC-16: a snapshot parses, with a full FindingRecord inside each column', () => {
    const run = MultiAgentRun.parse({
      id: 'mar-1',
      pr_id: 'pr-1',
      pr_number: 482,
      ran_at: '2026-01-01T00:00:00.000Z',
      agent_count: 1,
      total_duration_ms: 1200,
      total_cost_usd: 0.001,
      columns: [column],
      conflicts: [],
    });
    expect(run.columns[0]!.findings[0]).toMatchObject({ review_id: 'rev-1', end_line: 11, dismissed_at: null });
  });

  it('EC-18: a column of a deleted agent has null agent_id and agent_name; `cancelled` is a status', () => {
    expect(
      AgentColumn.safeParse({ ...column, agent_id: null, agent_name: null, status: 'cancelled', error: 'Cancelled by user' })
        .success,
    ).toBe(true);
    expect(AgentColumn.safeParse({ ...column, status: 'queued' }).success).toBe(false);
  });

  it('AC-34: a conflict take is keyed by run_id and carries `dismissed`', () => {
    const take = { run_id: 'run-1', agent_id: null, persona: null, verdict: 'ignored', note: '', dismissed: false };
    expect(Conflict.safeParse({ file: 'a.ts', line: 1, title: 't', contended: true, takes: [take] }).success).toBe(true);
    // `contended` and `dismissed` are required, not defaulted.
    expect(Conflict.safeParse({ file: 'a.ts', line: 1, title: 't', takes: [take] }).success).toBe(false);
    const { dismissed: _omit, ...noDismissed } = take;
    expect(Conflict.safeParse({ file: 'a.ts', line: 1, title: 't', contended: true, takes: [noDismissed] }).success).toBe(false);
  });

  it('EC-2: the request needs at least one agent id, and each must be a uuid', () => {
    expect(MultiAgentRunRequest.safeParse({ agentIds: [UUID] }).success).toBe(true);
    expect(MultiAgentRunRequest.safeParse({ agentIds: [] }).success).toBe(false);
    expect(MultiAgentRunRequest.safeParse({ agentIds: ['not-a-uuid'] }).success).toBe(false);
    expect(MultiAgentRunRequest.safeParse({}).success).toBe(false);
  });

  it('AC-5/EC-6: an estimate may have null duration and cost with runs_used 0', () => {
    const empty = { agent_id: 'a', duration_ms: null, cost_usd: null, runs_used: 0 };
    expect(AgentEstimate.safeParse(empty).success).toBe(true);
    expect(MultiAgentEstimates.safeParse({ agents: [empty] }).success).toBe(true);
    expect(AgentEstimate.safeParse({ ...empty, duration_ms: 1.5 }).success).toBe(false);
  });

  it('EC-22: a RunSummary without multi_agent_run_id (an old row) still parses, and one with it keeps it', () => {
    const base = {
      run_id: 'r',
      agent_id: null,
      agent_name: null,
      provider: null,
      model: null,
      status: 'done',
      error: null,
      duration_ms: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      findings_count: null,
      grounding: null,
      ran_at: null,
      score: null,
      blockers: null,
    };
    expect(RunSummary.parse(base).multi_agent_run_id).toBeUndefined();
    expect(RunSummary.parse({ ...base, multi_agent_run_id: 'mar-1' }).multi_agent_run_id).toBe('mar-1');
    expect(RunSummary.parse({ ...base, multi_agent_run_id: null }).multi_agent_run_id).toBeNull();
  });
});

/** `.default(<expr>)` → `.optional()`, the one allowed difference between the copies. */
const normalise = (src: string) =>
  src.replace(/\.default\((?:[^()]|\([^()]*\))*\)/g, '.optional()');

/** The text from `start` (inclusive) to `end` (exclusive), failing loudly if a marker is gone. */
function between(src: string, start: string, end: string, label: string): string {
  const s = src.indexOf(start);
  const e = src.indexOf(end, s + start.length);
  if (s === -1 || e === -1) throw new Error(`${label}: marker not found (${s === -1 ? start : end})`);
  return src.slice(s, e);
}

describe('NFR-7: SPEC-11 contract parity between the server and client vendor copies', () => {
  it('observability.ts: identical once `.default()` is read as `.optional()`', () => {
    const server = read(`${SERVER}observability.ts`);
    const client = read(`${CLIENT}observability.ts`);
    expect(server).toContain('export const MultiAgentRunRequest =');
    expect(server).toContain('export const MultiAgentEstimates =');
    expect(normalise(client)).toBe(normalise(server));
  });

  it('observability.ts: every `.default()` in the server copy is `.optional()` at the same place in the client copy', () => {
    const server = read(`${SERVER}observability.ts`).split('\n');
    const client = read(`${CLIENT}observability.ts`).split('\n');
    expect(client).toHaveLength(server.length);
    server.forEach((line, i) => {
      if (/\.default\(/.test(line)) expect(client[i], `line ${i + 1}`).toBe(normalise(line));
    });
  });

  it('observability.ts: every new schema has a paired type export, so the client can import types only', () => {
    const src = read(`${CLIENT}observability.ts`);
    for (const name of ['MultiAgentRunRequest', 'AgentEstimate', 'MultiAgentEstimates', 'ConflictTake', 'Conflict']) {
      expect(src).toContain(`export const ${name} =`);
      expect(src).toContain(`export type ${name} =`);
    }
  });

  it('trace.ts: the RunSummary block (with `multi_agent_run_id`) is byte-identical', () => {
    const region = (src: string) =>
      between(src, 'export const RunSummary = z.object({', 'export type RunSummary', 'trace.ts');
    const server = region(read(`${SERVER}trace.ts`));
    const client = region(read(`${CLIENT}trace.ts`));
    expect(server).toContain('multi_agent_run_id');
    expect(client).toBe(server);
  });

  it('review-api.ts: the FindingRecord block that AgentColumnFinding re-uses is byte-identical', () => {
    const region = (src: string) =>
      between(src, 'export const FindingRecord = ', 'export type FindingRecord', 'review-api.ts');
    expect(region(read(`${CLIENT}review-api.ts`))).toBe(region(read(`${SERVER}review-api.ts`)));
  });
});

describe('SPEC-11 named constants', () => {
  it('AC-14: the fan-out concurrency is the named constant `Infinity` (no agent waits for another)', () => {
    expect(MULTI_AGENT_CONCURRENCY).toBe(Infinity);
  });

  it('NFR-6: POST /pulls/:id/multi-agent-run is limited to 10 requests per minute', () => {
    expect(MULTI_AGENT_RATE_LIMIT).toEqual({ max: 10, timeWindow: '1 minute' });
  });
});
