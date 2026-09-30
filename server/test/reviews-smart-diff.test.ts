import { describe, it, expect } from 'vitest';
import { SMART_DIFF_ROLE_ORDER } from '../src/modules/reviews/smart-diff/constants.js';
import { buildSmartDiff } from '../src/modules/reviews/smart-diff/build-smart-diff.js';
import { latestFindingsPerAgent } from '../src/modules/reviews/smart-diff/latest-findings-per-agent.js';
import type { FindingRow, PrFileRow, ReviewRow } from '../src/db/rows.js';

/**
 * Smart Diff classifier — table-driven, pure-function coverage
 * (specs/lessons/L03 · plan `objective-files-federated-gosling.md`).
 *
 * Precedence is deliberate: boilerplate → tests → docs → wiring, core as the
 * fallback. See `smart-diff/constants.ts` for why that order was chosen.
 */
describe('SMART_DIFF_ROLE_ORDER', () => {
  it('is the enum order: core, tests, wiring, docs, boilerplate', () => {
    expect(SMART_DIFF_ROLE_ORDER).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
  });
});

describe('buildSmartDiff', () => {
  const file = (path: string, over: Partial<{ additions: number; deletions: number }> = {}): PrFileRow => ({
    id: path,
    prId: 'pr1',
    path,
    additions: over.additions ?? 1,
    deletions: over.deletions ?? 0,
    patch: null,
  });

  const finding = (over: Partial<FindingRow> = {}): FindingRow => ({
    id: 'f1',
    reviewId: 'r1',
    severity: 'CRITICAL',
    category: 'security',
    title: 't',
    file: 'src/config.ts',
    startLine: 12,
    endLine: 12,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifectaComponents: null,
    scope: null,
    acceptedAt: null,
    dismissedAt: null,
    ...over,
  });

  it('buckets files into groups, in SMART_DIFF_ROLE_ORDER, skipping empty groups', () => {
    const files = [file('src/api/users.ts'), file('src/foo.test.ts'), file('docs/x.md')];
    const result = buildSmartDiff(files, []);
    expect(result.groups.map((g) => g.role)).toEqual(['core', 'tests', 'docs']);
  });

  it('sorts files by path within each group, regardless of getPrFiles order', () => {
    const files = [file('src/b.ts'), file('src/a.ts')];
    const result = buildSmartDiff(files, []);
    expect(result.groups[0]!.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('finding_lines is the unique, sorted start_line values of non-dismissed findings for that path', () => {
    const files = [file('src/config.ts')];
    const findings = [
      finding({ id: 'f1', file: 'src/config.ts', startLine: 12 }),
      finding({ id: 'f2', file: 'src/config.ts', startLine: 5 }),
      finding({ id: 'f3', file: 'src/config.ts', startLine: 12 }),
      finding({ id: 'f4', file: 'src/config.ts', startLine: 99, dismissedAt: new Date() }),
      finding({ id: 'f5', file: 'other.ts', startLine: 1 }),
    ];
    const result = buildSmartDiff(files, findings);
    expect(result.groups[0]!.files[0]!.finding_lines).toEqual([5, 12]);
  });

  it('split_suggestion sums additions+deletions across all files, proposed_splits empty, too_big false', () => {
    const files = [file('a.ts', { additions: 10, deletions: 2 }), file('b.ts', { additions: 3, deletions: 1 })];
    const result = buildSmartDiff(files, []);
    expect(result.split_suggestion).toEqual({ too_big: false, total_lines: 16, proposed_splits: [] });
  });

  it('returns no groups for an empty file list', () => {
    const result = buildSmartDiff([] as PrFileRow[], []);
    expect(result.groups).toEqual([]);
    expect(result.split_suggestion.total_lines).toBe(0);
  });
});

describe('latestFindingsPerAgent', () => {
  const review = (over: Partial<ReviewRow> = {}): ReviewRow => ({
    id: 'r',
    workspaceId: 'w1',
    prId: 'pr1',
    agentId: 'a1',
    runId: null,
    kind: 'review',
    verdict: null,
    summary: null,
    score: null,
    model: null,
    createdAt: new Date(),
    ...over,
  });

  const finding = (id: string): FindingRow => ({
    id,
    reviewId: 'r',
    severity: 'CRITICAL',
    category: 'security',
    title: 't',
    file: 'src/config.ts',
    startLine: 12,
    endLine: 12,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifectaComponents: null,
    scope: null,
    acceptedAt: null,
    dismissedAt: null,
  });

  it('keeps only the newest review per agent, skips summaries, unions across agents, and treats a null agentId as its own key', () => {
    const rows = [
      // newest for a1 — kept
      { review: review({ id: 'r1', agentId: 'a1' }), findings: [finding('f1')] },
      // an OLDER run by the same agent — dropped, `rows` is newest-first
      { review: review({ id: 'r2', agentId: 'a1' }), findings: [finding('f2')] },
      // a summary row for a1 — skipped regardless of position
      { review: review({ id: 'r3', agentId: 'a1', kind: 'summary' }), findings: [finding('f3')] },
      // a second agent — unioned in
      { review: review({ id: 'r4', agentId: 'a2' }), findings: [finding('f4')] },
      // no agent at all — its own key ('none'), not merged with a1/a2
      { review: review({ id: 'r5', agentId: null }), findings: [finding('f5')] },
    ];

    const result = latestFindingsPerAgent(rows);
    expect(result.map((f) => f.id)).toEqual(['f1', 'f4', 'f5']);
  });

  it('returns no findings for an empty review list', () => {
    expect(latestFindingsPerAgent([])).toEqual([]);
  });
});
