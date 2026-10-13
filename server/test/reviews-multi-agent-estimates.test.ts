import { describe, it, expect } from 'vitest';
import { estimateFor, median } from '../src/modules/reviews/multi-agent/estimates.js';

/**
 * SPEC-11 AC-5 — the estimate maths: medians over an agent's last done runs.
 * Pure (NFR-1). The "last 5 runs, any PR, CI included" window is a SQL concern
 * and is covered in `multi-agent.it.test.ts`.
 */

describe('median', () => {
  it('AC-5: odd count → the middle value, regardless of input order', () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it('AC-5: even count → the mean of the two middle values', () => {
    expect(median([40, 10, 20, 30])).toBe(25);
  });

  it('AC-5: a median over zero values is null', () => {
    expect(median([])).toBeNull();
  });

  it('does not reorder the caller input', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('estimateFor', () => {
  it('AC-5: duration and cost are medians of the samples; runs_used counts them', () => {
    const est = estimateFor('agent-1', [
      { durationMs: 1000, costUsd: 0.01 },
      { durationMs: 3000, costUsd: 0.03 },
      { durationMs: 2000, costUsd: 0.02 },
    ]);
    expect(est).toEqual({ agent_id: 'agent-1', duration_ms: 2000, cost_usd: 0.02, runs_used: 3 });
  });

  it('AC-5: an even number of runs gives the mean of the two middle values', () => {
    const est = estimateFor('a', [
      { durationMs: 1000, costUsd: 0.02 },
      { durationMs: 2000, costUsd: 0.04 },
      { durationMs: 9000, costUsd: 0.06 },
      { durationMs: 4000, costUsd: 0.08 },
    ]);
    expect(est.duration_ms).toBe(3000);
    expect(est.cost_usd).toBeCloseTo(0.05);
  });

  it('AC-5: a null cost is ignored, never counted as zero, but the run still counts in runs_used', () => {
    const est = estimateFor('a', [
      { durationMs: 1000, costUsd: null },
      { durationMs: 2000, costUsd: 0.1 },
      { durationMs: 3000, costUsd: 0.3 },
    ]);
    expect(est.cost_usd).toBeCloseTo(0.2); // median of [0.1, 0.3], not of [0, 0.1, 0.3]
    expect(est.runs_used).toBe(3);
  });

  it('AC-5: a null duration is ignored the same way', () => {
    const est = estimateFor('a', [
      { durationMs: null, costUsd: 0.1 },
      { durationMs: 6000, costUsd: 0.1 },
    ]);
    expect(est.duration_ms).toBe(6000);
  });

  it('AC-5/EC-6: no runs → null duration and cost with runs_used 0 (the UI shows "—")', () => {
    expect(estimateFor('a', [])).toEqual({ agent_id: 'a', duration_ms: null, cost_usd: null, runs_used: 0 });
  });

  it('AC-5: runs whose cost is all null give a null cost, not 0', () => {
    const est = estimateFor('a', [
      { durationMs: 1000, costUsd: null },
      { durationMs: 2000, costUsd: null },
    ]);
    expect(est.cost_usd).toBeNull();
    expect(est.duration_ms).toBe(1500);
  });

  it('AC-5: the duration stays an integer when the even-count mean is a half', () => {
    const est = estimateFor('a', [
      { durationMs: 1, costUsd: null },
      { durationMs: 2, costUsd: null },
    ]);
    expect(Number.isInteger(est.duration_ms)).toBe(true);
    expect(est.duration_ms).toBe(2);
  });
});
