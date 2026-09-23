import { describe, it, expect } from 'vitest';
import type { Finding, IntentSource, UnifiedDiff } from '@devdigest/shared';
import { FEATURE_MODELS } from '@devdigest/shared';
import {
  applyScopeFilter,
  buildHunkHeaderDigest,
  buildIntentSources,
  computeIntentConfidence,
  detectExternalLinks,
  findingMatchesOutOfScope,
  taskLine,
} from '../src/modules/reviews/helpers.js';
import { INTENT_FALLBACK_PROVIDER, INTENT_FALLBACK_MODEL } from '../src/modules/reviews/constants.js';

/**
 * `constants.ts`'s INTENT_FALLBACK_PROVIDER/MODEL deliberately MIRROR (not
 * import) FEATURE_MODELS's `review_intent` entry — see the docblock there for
 * why it's a separate constant. Nothing in the type system keeps the two in
 * sync, so this guard fails loudly if a future registry-default change (or a
 * fallback-constant change) makes the classifier's actual fallback diverge
 * from what Settings tells the user the default is.
 */
describe('INTENT_FALLBACK_PROVIDER/MODEL mirrors FEATURE_MODELS', () => {
  it('matches the review_intent registry entry', () => {
    const entry = FEATURE_MODELS.find((f) => f.id === 'review_intent');
    expect(entry).toBeDefined();
    expect(INTENT_FALLBACK_PROVIDER).toBe(entry?.defaultProvider);
    expect(INTENT_FALLBACK_MODEL).toBe(entry?.defaultModel);
  });
});

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

/**
 * Intent Layer (specs/03-intent-layer.md) — pure-helper coverage per §11:
 * the hunk-header digest builder, the confidence/sources fallback logic, and
 * the deterministic scope-filter matching function.
 */
describe('buildHunkHeaderDigest', () => {
  const diff = (files: UnifiedDiff['files']): UnifiedDiff => ({ raw: '', files });

  it('emits one @@ header line per hunk, grouped by file — never content', () => {
    const text = buildHunkHeaderDigest(
      diff([
        {
          path: 'src/a.ts',
          additions: 1,
          deletions: 0,
          hunks: [
            { file: 'src/a.ts', oldStart: 10, oldLines: 5, newStart: 10, newLines: 7, newLineNumbers: [] },
            { file: 'src/a.ts', oldStart: 50, oldLines: 3, newStart: 52, newLines: 3, newLineNumbers: [] },
          ],
        },
        {
          path: 'src/b.ts',
          additions: 1,
          deletions: 0,
          hunks: [{ file: 'src/b.ts', oldStart: 1, oldLines: 10, newStart: 1, newLines: 12, newLineNumbers: [] }],
        },
      ]),
    );
    expect(text).toBe(
      '### src/a.ts\n@@ -10,5 +10,7 @@\n@@ -50,3 +52,3 @@\n### src/b.ts\n@@ -1,10 +1,12 @@',
    );
  });

  it('omits files with no hunks and returns "" for an empty diff', () => {
    expect(buildHunkHeaderDigest(diff([]))).toBe('');
    expect(buildHunkHeaderDigest(diff([{ path: 'a.ts', additions: 0, deletions: 0, hunks: [] }]))).toBe('');
  });
});

describe('buildIntentSources / computeIntentConfidence', () => {
  it('empty description + no linked issue → low confidence, description marked missing', () => {
    const sources = buildIntentSources({
      description: '',
      hunkHeaderDigest: '### a.ts\n@@ -1,1 +1,1 @@',
      linkedIssue: { status: 'missing' },
    });
    expect(sources).toContainEqual({ kind: 'description', status: 'missing', note: 'PR description is empty' });
    expect(computeIntentConfidence(sources)).toBe('low');
  });

  it('description present, linked issue unreachable → medium confidence, never fabricated', () => {
    const sources = buildIntentSources({
      description: 'Adds rate limiting.',
      hunkHeaderDigest: '### a.ts\n@@ -1,1 +1,1 @@',
      linkedIssue: { status: 'unreachable', note: 'GitHub 404' },
    });
    expect(sources).toContainEqual({ kind: 'linked_issue', status: 'unreachable', note: 'GitHub 404' });
    expect(computeIntentConfidence(sources)).toBe('medium');
  });

  it('description + linked issue both present → high confidence', () => {
    const sources = buildIntentSources({
      description: 'Adds rate limiting.',
      hunkHeaderDigest: '### a.ts\n@@ -1,1 +1,1 @@',
      linkedIssue: { status: 'used' },
    });
    expect(computeIntentConfidence(sources)).toBe('high');
  });

  it('no spec/external link mentioned → no `spec` source entry at all', () => {
    const sources = buildIntentSources({
      description: 'Adds rate limiting.',
      hunkHeaderDigest: '### a.ts\n@@ -1,1 +1,1 @@',
      linkedIssue: { status: 'missing' },
    });
    expect(sources.find((s) => s.kind === 'spec')).toBeUndefined();
  });

  it('description links to an external plan/spec URL that cannot be fetched → spec source is "unreachable", never fabricated (specs/03-intent-layer.md §13)', () => {
    const sources = buildIntentSources({
      description: 'See the plan at https://example.atlassian.net/wiki/spaces/ENG/pages/123',
      hunkHeaderDigest: '### a.ts\n@@ -1,1 +1,1 @@',
      linkedIssue: { status: 'missing' },
      externalLinks: ['https://example.atlassian.net/wiki/spaces/ENG/pages/123'],
    });
    expect(sources).toContainEqual({
      kind: 'spec',
      status: 'unreachable',
      note: 'Description links to https://example.atlassian.net/wiki/spaces/ENG/pages/123 — no outbound link fetching is implemented, so this was not read',
    });
  });

  it('specs fetched (once Project Context exists) take priority over an unreachable external link', () => {
    const sources = buildIntentSources({
      description: 'See https://example.com/plan',
      hunkHeaderDigest: '### a.ts\n@@ -1,1 +1,1 @@',
      linkedIssue: { status: 'missing' },
      specs: ['## Architecture\n...'],
      externalLinks: ['https://example.com/plan'],
    });
    expect(sources).toContainEqual({ kind: 'spec', status: 'used' });
  });

  it('a PR with no issue reference at all is not penalized (missing != unreachable)', () => {
    const sources: IntentSource[] = [
      { kind: 'title', status: 'used' },
      { kind: 'description', status: 'used' },
      { kind: 'hunk_headers', status: 'used' },
      { kind: 'linked_issue', status: 'missing' },
    ];
    expect(computeIntentConfidence(sources)).toBe('high');
  });
});

describe('detectExternalLinks', () => {
  it('returns [] for no description or no links', () => {
    expect(detectExternalLinks(undefined)).toEqual([]);
    expect(detectExternalLinks(null)).toEqual([]);
    expect(detectExternalLinks('Adds rate limiting, no links here.')).toEqual([]);
  });

  it('finds http(s) links, deduped, stopping at whitespace/paren/bracket', () => {
    const links = detectExternalLinks(
      'See (https://example.com/plan) and https://example.com/plan again, ' +
        'plus http://jira.local/BROWSE/PROJ-1.',
    );
    expect(links).toEqual(['https://example.com/plan', 'http://jira.local/BROWSE/PROJ-1.']);
  });
});

describe('findingMatchesOutOfScope / applyScopeFilter', () => {
  const mkFinding = (over: Partial<Finding> = {}): Finding => ({
    id: 'f1',
    severity: 'WARNING',
    category: 'style',
    title: 'Inconsistent quote style',
    file: 'server/src/db/schema/reviews.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.8,
    ...over,
  });

  it('matches when the out-of-scope entry names the file path', () => {
    expect(
      findingMatchesOutOfScope(mkFinding(), ['unrelated formatting in server/src/db/schema/reviews.ts']),
    ).toBe(true);
  });

  it('matches on a shared distinctive word between the entry and the finding title', () => {
    expect(
      findingMatchesOutOfScope(
        mkFinding({ title: 'Drop of unrelated whitespace changes', file: 'a.ts' }),
        ['cleans up unrelated whitespace elsewhere in the file'],
      ),
    ).toBe(true);
  });

  it('does not match on generic/short words (biased toward keeping when uncertain)', () => {
    expect(findingMatchesOutOfScope(mkFinding({ file: 'x.ts', title: 'Bug fix' }), ['fix'])).toBe(false);
    expect(findingMatchesOutOfScope(mkFinding({ file: 'x.ts', title: 'Bug fix' }), [''])).toBe(false);
  });

  it('does not match an unrelated file/title', () => {
    expect(
      findingMatchesOutOfScope(mkFinding({ file: 'client/src/app/page.tsx', title: 'Missing key prop' }), [
        'the payment retry logic',
      ]),
    ).toBe(false);
  });

  it('applyScopeFilter is a no-op when intent is undefined (no behavior change)', () => {
    const findings = [mkFinding()];
    expect(applyScopeFilter(findings, undefined, 'critical')).toBe(findings);
  });

  it('applyScopeFilter is a no-op when out_of_scope is empty', () => {
    const findings = [mkFinding()];
    expect(applyScopeFilter(findings, { out_of_scope: [] }, 'critical')).toBe(findings);
  });

  it('drops a matched finding whose severity does NOT meet the ciFailOn gate', () => {
    const findings = [mkFinding({ severity: 'SUGGESTION' })];
    const out = applyScopeFilter(
      findings,
      { out_of_scope: ['unrelated changes in server/src/db/schema/reviews.ts'] },
      'critical',
    );
    expect(out).toHaveLength(0);
  });

  it('keeps a matched finding whose severity meets the ciFailOn gate, tagged scope=out_of_scope', () => {
    const findings = [mkFinding({ severity: 'CRITICAL' })];
    const out = applyScopeFilter(
      findings,
      { out_of_scope: ['unrelated changes in server/src/db/schema/reviews.ts'] },
      'critical',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.scope).toBe('out_of_scope');
  });

  it('leaves a non-matching finding untouched (scope stays null/absent)', () => {
    const findings = [mkFinding({ file: 'unrelated/file.ts' })];
    const out = applyScopeFilter(
      findings,
      { out_of_scope: ['unrelated changes in server/src/db/schema/reviews.ts'] },
      'critical',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.scope).toBeUndefined();
  });
});
