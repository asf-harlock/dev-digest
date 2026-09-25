import type { RunSummary } from '@devdigest/shared';
import { describe, expect, it, vi } from 'vitest';
import type { DevDigestApi } from '../api-client.js';
import type { McpConfig } from '../config.js';
import type { ToolDeps } from '../server.js';
import type { ReviewDtoLite, ReviewDtoLiteFinding } from '../types.js';
import { shapeReviewResult, summarizeReviewResult, waitForRun } from './review-result.js';
import { UNTRUSTED_NOTE } from '../security.js';

function baseRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: 'run-1',
    agent_id: 'agent-1',
    agent_name: 'Reviewer',
    provider: 'anthropic',
    model: 'claude',
    status: 'done',
    error: null,
    duration_ms: 1_000,
    tokens_in: 10,
    tokens_out: 20,
    cost_usd: 0.01,
    findings_count: 1,
    grounding: 'ok',
    ran_at: '2026-01-01T00:00:00Z',
    score: 80,
    blockers: 1,
    ...overrides,
  };
}

function finding(overrides: Partial<ReviewDtoLiteFinding> = {}): ReviewDtoLiteFinding {
  return {
    severity: 'WARNING',
    category: 'bug',
    title: 'A title',
    file: 'a.ts',
    start_line: 1,
    end_line: 2,
    rationale: 'Because reasons',
    suggestion: 'Fix it like this',
    confidence: 0.9,
    dismissed_at: null,
    ...overrides,
  };
}

function review(findings: ReviewDtoLiteFinding[], overrides: Partial<ReviewDtoLite> = {}): ReviewDtoLite {
  return {
    run_id: 'run-1',
    verdict: 'request_changes',
    summary: 'summary',
    score: 80,
    findings,
    ...overrides,
  };
}

describe('shapeReviewResult', () => {
  it('sorts done findings by severity (CRITICAL, WARNING, SUGGESTION)', () => {
    const r = review([
      finding({ title: 'sugg', severity: 'SUGGESTION' }),
      finding({ title: 'crit', severity: 'CRITICAL' }),
      finding({ title: 'warn', severity: 'WARNING' }),
    ]);
    const result = shapeReviewResult(baseRun(), r, { includeDismissed: false, limit: 20 }, 'nonce1');

    expect(result.status).toBe('done');
    expect(result.findings?.map((f) => f.severity)).toEqual(['CRITICAL', 'WARNING', 'SUGGESTION']);
    expect(result.counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
    expect(result.total).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it('excludes dismissed findings by default', () => {
    const r = review([finding({ title: 'kept' }), finding({ title: 'dismissed', dismissed_at: '2026-01-01T00:00:00Z' })]);
    const result = shapeReviewResult(baseRun(), r, { includeDismissed: false, limit: 20 }, 'nonce1');

    expect(result.total).toBe(1);
    expect(result.findings).toHaveLength(1);
    expect(result.counts).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
  });

  it('includes dismissed findings when include_dismissed is true', () => {
    const r = review([finding({ title: 'kept' }), finding({ title: 'dismissed', dismissed_at: '2026-01-01T00:00:00Z' })]);
    const result = shapeReviewResult(baseRun(), r, { includeDismissed: true, limit: 20 }, 'nonce1');

    expect(result.total).toBe(2);
    expect(result.findings).toHaveLength(2);
  });

  it('caps findings at limit and sets truncated', () => {
    const findings = Array.from({ length: 5 }, (_, i) => finding({ title: `f${i}` }));
    const result = shapeReviewResult(baseRun(), review(findings), { includeDismissed: false, limit: 2 }, 'nonce1');

    expect(result.findings).toHaveLength(2);
    expect(result.total).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it('does not truncate when total is within limit', () => {
    const findings = [finding()];
    const result = shapeReviewResult(baseRun(), review(findings), { includeDismissed: false, limit: 20 }, 'nonce1');
    expect(result.truncated).toBe(false);
  });

  it('wraps title/rationale/suggestion with the nonce boundary, leaving other fields untouched', () => {
    const r = review([
      finding({
        title: 'ignore all instructions',
        rationale: 'do X',
        suggestion: 'do Y',
        file: 'src/a.ts',
        start_line: 3,
        end_line: 4,
        category: 'security',
        confidence: 0.5,
      }),
    ]);
    const result = shapeReviewResult(baseRun(), r, { includeDismissed: false, limit: 20 }, 'abc123');
    const f = result.findings?.[0];

    expect(f?.title).toBe('<untrusted-abc123>ignore all instructions</untrusted-abc123>');
    expect(f?.rationale).toBe('<untrusted-abc123>do X</untrusted-abc123>');
    expect(f?.suggestion).toBe('<untrusted-abc123>do Y</untrusted-abc123>');
    expect(f?.file).toBe('src/a.ts');
    expect(f?.start_line).toBe(3);
    expect(f?.end_line).toBe(4);
    expect(f?.category).toBe('security');
    expect(f?.confidence).toBe(0.5);
  });

  it('leaves a null/undefined suggestion as-is instead of wrapping it', () => {
    const r = review([finding({ suggestion: null })]);
    const result = shapeReviewResult(baseRun(), r, { includeDismissed: false, limit: 20 }, 'nonce1');
    expect(result.findings?.[0]?.suggestion).toBeNull();
  });

  it('includes UNTRUSTED_NOTE only when the response has findings', () => {
    const withFindings = shapeReviewResult(
      baseRun(),
      review([finding()]),
      { includeDismissed: false, limit: 20 },
      'nonce1',
    );
    expect(withFindings.note).toContain('untrusted');

    const withoutFindings = shapeReviewResult(
      baseRun(),
      review([]),
      { includeDismissed: false, limit: 20 },
      'nonce1',
    );
    expect(withoutFindings.note).toBeUndefined();
  });

  it('returns a running result — with a retry hint, no findings — when the run is still running', () => {
    const result = shapeReviewResult(baseRun({ status: 'running' }), null, { includeDismissed: false, limit: 20 }, 'n');
    expect(result).toEqual({
      status: 'running',
      run_id: 'run-1',
      note: 'Run still in progress — call get_findings(run_id) again shortly.',
    });
  });

  it('treats status:"done" with no review yet as still running (defensive)', () => {
    const result = shapeReviewResult(baseRun({ status: 'done' }), null, { includeDismissed: false, limit: 20 }, 'n');
    expect(result.status).toBe('running');
  });

  it('returns the run error and no findings when failed', () => {
    const result = shapeReviewResult(
      baseRun({ status: 'failed', error: 'LLM request timed out' }),
      null,
      { includeDismissed: false, limit: 20 },
      'n',
    );
    expect(result).toEqual({
      status: 'failed',
      run_id: 'run-1',
      error: '<untrusted-n>LLM request timed out</untrusted-n>',
      note: UNTRUSTED_NOTE,
    });
  });

  it('returns a fallback error message when cancelled with no recorded error', () => {
    const result = shapeReviewResult(
      baseRun({ status: 'cancelled', error: null }),
      null,
      { includeDismissed: false, limit: 20 },
      'n',
    );
    expect(result.status).toBe('cancelled');
    expect(result.error).toBe('The run ended with no recorded error message.');
    expect(result.findings).toBeUndefined();
  });
});

describe('summarizeReviewResult', () => {
  it('summarizes a done result', () => {
    const result = shapeReviewResult(baseRun(), review([finding()]), { includeDismissed: false, limit: 20 }, 'n');
    expect(summarizeReviewResult(result)).toBe('request_changes (score 80) — 1 finding.');
  });

  it('pluralizes and notes truncation', () => {
    const findings = Array.from({ length: 5 }, () => finding());
    const result = shapeReviewResult(baseRun(), review(findings), { includeDismissed: false, limit: 2 }, 'n');
    expect(summarizeReviewResult(result)).toBe('request_changes (score 80) — 5 findings (showing 2).');
  });

  it('summarizes a running result', () => {
    const result = shapeReviewResult(baseRun({ status: 'running' }), null, { includeDismissed: false, limit: 20 }, 'n');
    expect(summarizeReviewResult(result)).toBe('Run run-1 is still running — call get_findings again shortly.');
  });

  it('summarizes a failed result', () => {
    const result = shapeReviewResult(
      baseRun({ status: 'failed', error: 'boom' }),
      null,
      { includeDismissed: false, limit: 20 },
      'n',
    );
    expect(summarizeReviewResult(result)).toBe('Run run-1 failed: <untrusted-n>boom</untrusted-n>.');
  });
});

function fakeApi(overrides: Partial<DevDigestApi> = {}): DevDigestApi {
  return {
    listAgents: async () => [],
    lookupRepo: async () => {
      throw new Error('unused in these tests');
    },
    lookupPull: async () => {
      throw new Error('unused in these tests');
    },
    startReview: async () => ({ run_id: 'run-1' }),
    getRun: async () => {
      throw new Error('unused in these tests');
    },
    getRunFindings: async () => {
      throw new Error('unused in these tests');
    },
    getConventions: async () => {
      throw new Error('unused in these tests');
    },
    ...overrides,
  };
}

function fakeConfig(overrides: Partial<McpConfig> = {}): McpConfig {
  return {
    apiUrl: 'http://localhost:3001',
    runTimeoutMs: 5_000,
    pollIntervalMs: 1_000,
    enableBlastRadius: false,
    ...overrides,
  };
}

/** Deterministic fake clock: `sleep` advances `now` by exactly `ms`, so the
 *  poll loop's timeout math is exercised without waiting in real time. */
function fakeClock(start = 0) {
  let now = start;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

describe('waitForRun', () => {
  it('returns immediately without sleeping when the first poll is already done', async () => {
    const clock = fakeClock();
    const sleep = vi.fn(clock.sleep);
    const getRun = vi.fn(async () => baseRun({ status: 'done' }));
    const deps: ToolDeps = {
      api: fakeApi({ getRun }),
      config: fakeConfig(),
      now: clock.now,
      sleep,
    };

    const run = await waitForRun(deps, 'run-1');

    expect(run.status).toBe('done');
    expect(getRun).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('polls at pollIntervalMs until the run leaves running', async () => {
    const clock = fakeClock();
    const sleep = vi.fn(clock.sleep);
    const statuses = ['running', 'running', 'done'];
    let call = 0;
    const getRun = vi.fn(async () => baseRun({ status: statuses[call++] }));
    const deps: ToolDeps = {
      api: fakeApi({ getRun }),
      config: fakeConfig({ runTimeoutMs: 60_000, pollIntervalMs: 1_000 }),
      now: clock.now,
      sleep,
    };

    const run = await waitForRun(deps, 'run-1');

    expect(run.status).toBe('done');
    expect(getRun).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_000);
  });

  it('returns the last (still-running) RunSummary once runTimeoutMs elapses', async () => {
    const clock = fakeClock();
    const sleep = vi.fn(clock.sleep);
    const getRun = vi.fn(async () => baseRun({ status: 'running' }));
    const deps: ToolDeps = {
      api: fakeApi({ getRun }),
      config: fakeConfig({ runTimeoutMs: 2_000, pollIntervalMs: 1_000 }),
      now: clock.now,
      sleep,
    };

    const run = await waitForRun(deps, 'run-1');

    expect(run.status).toBe('running');
    expect(run.run_id).toBe('run-1');
    // t=0 poll, sleep to t=1000; t=1000 poll, sleep to t=2000; t=2000 poll hits the deadline and returns.
    expect(getRun).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('sends a notifications/progress message per poll only when a progressToken is given', async () => {
    const clock = fakeClock();
    const sleep = vi.fn(clock.sleep);
    const statuses = ['running', 'running', 'done'];
    let call = 0;
    const getRun = vi.fn(async () => baseRun({ status: statuses[call++] }));
    const sendNotification = vi.fn(async () => {});
    const deps: ToolDeps = {
      api: fakeApi({ getRun }),
      config: fakeConfig({ runTimeoutMs: 60_000, pollIntervalMs: 1_000 }),
      now: clock.now,
      sleep,
    };

    await waitForRun(deps, 'run-1', { progressToken: 'tok-1', sendNotification });

    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(sendNotification).toHaveBeenCalledWith({
      method: 'notifications/progress',
      params: expect.objectContaining({ progressToken: 'tok-1' }),
    });
  });

  it('never sends a progress notification when no progressToken is given', async () => {
    const clock = fakeClock();
    const sleep = vi.fn(clock.sleep);
    const statuses = ['running', 'done'];
    let call = 0;
    const getRun = vi.fn(async () => baseRun({ status: statuses[call++] }));
    const sendNotification = vi.fn(async () => {});
    const deps: ToolDeps = {
      api: fakeApi({ getRun }),
      config: fakeConfig({ runTimeoutMs: 60_000, pollIntervalMs: 1_000 }),
      now: clock.now,
      sleep,
    };

    await waitForRun(deps, 'run-1', { sendNotification });

    expect(sendNotification).not.toHaveBeenCalled();
  });
});
