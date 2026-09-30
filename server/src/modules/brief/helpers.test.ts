import { describe, it, expect } from 'vitest';
import type { BlastRadius, BriefModelOutput, Risk, ReviewFocusItem } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { hunkHeadersByFile } from '../_shared/hunk-headers.js';
import {
  buildBriefPrompt,
  computeMissingInputs,
  computeStale,
  groundBrief,
  orderFiles,
  type BriefPromptInput,
  type MissingInputFacts,
} from './helpers.js';
import { MAX_FOCUS, MAX_RISKS, PROMPT_TOKEN_CAP } from './constants.js';

/** Hermetic — pure helpers, no I/O. */

const risk = (over: Partial<Risk> = {}): Risk => ({
  kind: 'logic',
  title: 'A risk',
  explanation: 'Why it matters',
  severity: 'medium',
  file_refs: ['src/a.ts'],
  ...over,
});
const focus = (over: Partial<ReviewFocusItem> = {}): ReviewFocusItem => ({
  file: 'src/a.ts',
  line: 5,
  reason: 'Check this',
  ...over,
});
const out = (over: Partial<BriefModelOutput> = {}): BriefModelOutput => ({
  summary: 'Summary',
  risks: [],
  review_focus: [],
  ...over,
});
const ALLOWED = new Set(['src/a.ts', 'src/b.ts']);

describe('groundBrief', () => {
  it('AC-17: drops a focus item whose file is not in the PR or blast map', () => {
    const { brief, dropped } = groundBrief(
      out({ review_focus: [focus(), focus({ file: 'src/ghost.ts', line: 1 })] }),
      ALLOWED,
    );
    expect(brief.review_focus.map((f) => f.file)).toEqual(['src/a.ts']);
    expect(dropped.focus).toBe(1);
  });

  it('AC-17: keeps refs to a blast-map file passed in the allowed set', () => {
    const { brief } = groundBrief(
      out({ risks: [risk({ file_refs: ['src/caller.ts:3'] })] }),
      new Set([...ALLOWED, 'src/caller.ts']),
    );
    expect(brief.risks).toHaveLength(1);
  });

  it('AC-18: drops unknown refs but keeps the risk while a known ref is left; ranges resolve by path', () => {
    const { brief, dropped } = groundBrief(
      out({ risks: [risk({ file_refs: ['src/ghost.ts', 'src/a.ts:10-20', 'src/b.ts'] })] }),
      ALLOWED,
    );
    expect(brief.risks[0]?.file_refs).toEqual(['src/a.ts:10-20', 'src/b.ts']);
    expect(dropped.refs).toBe(1);
    expect(dropped.risks).toBe(0);
  });

  it('AC-18: drops a risk that has no refs left', () => {
    const { brief, dropped } = groundBrief(
      out({ risks: [risk({ file_refs: ['src/ghost.ts'] }), risk({ file_refs: [] }), risk({ title: 'kept' })] }),
      ALLOWED,
    );
    expect(brief.risks.map((r) => r.title)).toEqual(['kept']);
    expect(dropped.risks).toBe(2);
  });

  it('AC-19: caps at 8 risks and 6 focus items, keeping the first ones in model order', () => {
    const risks = Array.from({ length: 12 }, (_, i) => risk({ title: `r${i}` }));
    const items = Array.from({ length: 10 }, (_, i) => focus({ line: i + 1 }));
    const { brief } = groundBrief(out({ risks, review_focus: items }), ALLOWED);
    expect(MAX_RISKS).toBe(8);
    expect(MAX_FOCUS).toBe(6);
    expect(brief.risks.map((r) => r.title)).toEqual(risks.slice(0, 8).map((r) => r.title));
    expect(brief.review_focus.map((f) => f.line)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('AC-19: dedupes focus items on file and line (same line in another file is kept)', () => {
    const { brief, dropped } = groundBrief(
      out({
        review_focus: [
          focus({ reason: 'first' }),
          focus({ reason: 'dup' }),
          focus({ line: 6 }),
          focus({ file: 'src/b.ts', line: 5 }),
        ],
      }),
      ALLOWED,
    );
    expect(brief.review_focus.map((f) => `${f.file}:${f.line}`)).toEqual(['src/a.ts:5', 'src/a.ts:6', 'src/b.ts:5']);
    expect(brief.review_focus[0]?.reason).toBe('first');
    expect(dropped.focus).toBe(1);
  });

  it('D4: a focus line outside any hunk (or absurdly large) keeps the item', () => {
    const { brief } = groundBrief(out({ review_focus: [focus({ line: 99_999 }), focus({ line: 0 })] }), ALLOWED);
    expect(brief.review_focus.map((f) => f.line)).toEqual([99_999, 0]);
  });

  it('F6: redacts secret-shaped text in model output', () => {
    const { brief } = groundBrief(
      out({ summary: 'key sk_live_xxxxxxxxxxxx leaked', risks: [risk({ explanation: 'sk_live_yyyyyyyyyyyy' })] }),
      ALLOWED,
    );
    expect(JSON.stringify(brief)).not.toMatch(/sk_live_[xy]{12}/);
  });
});

// A patch with added, removed and context lines plus a function-context trailer.
const PATCH = [
  '@@ -10,4 +10,4 @@ function trailerLeak(apiKeyHolder) {',
  ' const CONTEXT_LINE_MARKER = 1;',
  '-const REMOVED_LINE_MARKER = 2;',
  '+const ADDED_LINE_MARKER = 3;',
  ' const CONTEXT_TWO_MARKER = 4;',
].join('\n');

function diffOf(path: string, patch: string) {
  return parseUnifiedDiff([`diff --git a/${path} b/${path}`, `--- a/${path}`, `+++ b/${path}`, patch].join('\n'));
}

const count = (t: string) => Math.ceil(t.length / 4);

function promptInput(over: Partial<BriefPromptInput> = {}): BriefPromptInput {
  return {
    title: 'Add limiter',
    description: 'Adds a limiter',
    issueText: null,
    intent: null,
    blast: null,
    files: [{ path: 'src/a.ts', additions: 1, deletions: 1, role: 'core' }],
    hunkHeaders: hunkHeadersByFile(diffOf('src/a.ts', PATCH)),
    specs: [],
    budget: PROMPT_TOKEN_CAP,
    count,
    ...over,
  };
}

describe('buildBriefPrompt', () => {
  it('NFR-14 / F5: no added, removed or context line and no hunk trailer reaches the prompt; it fits the cap', () => {
    const { text, tokens } = buildBriefPrompt(promptInput());
    expect(text).toContain('@@ -10,4 +10,4 @@');
    for (const leak of ['ADDED_LINE_MARKER', 'REMOVED_LINE_MARKER', 'CONTEXT_LINE_MARKER', 'CONTEXT_TWO_MARKER', 'trailerLeak', 'apiKeyHolder']) {
      expect(text).not.toContain(leak);
    }
    expect(tokens).toBeLessThanOrEqual(16_000);
  });

  it('NFR-3: trims hunk headers, then caller files, then specs to fit the budget, and flags it', () => {
    const blast: BlastRadius = {
      changed_symbols: [{ name: 'f', file: 'src/a.ts', kind: 'function' }],
      downstream: [{ symbol: 'f', callers: [{ name: 'g', file: 'src/caller.ts', line: 1 }], endpoints_affected: [], crons_affected: [] }],
      summary: 'one caller',
    };
    const specs = [{ path: 'docs/spec.md', text: 'x'.repeat(4000) }];
    const full = buildBriefPrompt(promptInput({ blast, specs }));
    expect(full.trimmed).toBe(false);
    expect(full.text).toContain('src/caller.ts');

    const tight = buildBriefPrompt(promptInput({ blast, specs, budget: full.tokens - 50 }));
    expect(tight.trimmed).toBe(true);
    expect(tight.text).not.toContain('Hunk headers');
    const tighter = buildBriefPrompt(promptInput({ blast, specs, budget: 200 }));
    expect(tighter.text).not.toContain('src/caller.ts');
    expect(tighter.text).not.toContain('docs/spec.md');
    expect(tighter.tokens).toBeLessThanOrEqual(200);
  });

  it.each([
    ['no spec entries', []],
    ['only empty entries', [{ path: 'docs/empty.md', text: '' }, { path: 'docs/blank.md', text: '  \n ' }]],
  ])('EC-26 / F9: no spec section for %s', (_n, specs) => {
    const { text } = buildBriefPrompt(promptInput({ specs }));
    expect(text).not.toContain('Project context');
    expect(text).not.toContain('spec:');
    expect(text).not.toContain('docs/empty.md');
  });

  it('EC-26 / F9: an empty entry next to a real one does not produce a second block', () => {
    const { text } = buildBriefPrompt(
      promptInput({ specs: [{ path: 'docs/empty.md', text: '' }, { path: 'docs/real.md', text: 'Real spec' }] }),
    );
    expect(text).toContain('docs/real.md');
    expect(text).not.toContain('docs/empty.md');
  });

  it('F6: secrets in description, issue, intent and spec are redacted before wrapping', () => {
    const { text } = buildBriefPrompt(
      promptInput({
        description: 'body sk_live_aaaaaaaaaaaa',
        issueText: '#1 t\nissue sk_live_bbbbbbbbbbbb',
        intent: { intent: 'intent sk_live_cccccccccccc', in_scope: [], out_of_scope: [] },
        specs: [{ path: 'docs/s.md', text: 'spec sk_live_dddddddddddd' }],
      }),
    );
    expect(text).not.toMatch(/sk_live_[a-d]{12}/);
    expect(text).toContain('[REDACTED:stripe_key]');
  });
});

describe('computeStale', () => {
  it('Q-G: a null, undefined or empty generated_for_sha is not stale', () => {
    expect(computeStale(null, 'abc')).toBe(false);
    expect(computeStale(undefined, 'abc')).toBe(false);
    expect(computeStale('', 'abc')).toBe(false);
  });
  it('AC-24: a different SHA is stale, the same one is not', () => {
    expect(computeStale('old', 'new')).toBe(true);
    expect(computeStale('same', 'same')).toBe(false);
  });
});

describe('computeMissingInputs', () => {
  const healthy: MissingInputFacts = {
    description: 'Real description',
    issue: { status: 'used' },
    intent: { classifiedForSha: 'sha1' },
    headSha: 'sha1',
    blast: { degraded: false },
    specCount: 1,
    totalFiles: 3,
    promptTrimmed: false,
  };
  const kinds = (f: Partial<MissingInputFacts>) => computeMissingInputs({ ...healthy, ...f }).map((m) => m.kind);

  it('AC-25: nothing missing when every input is present', () => {
    expect(kinds({})).toEqual([]);
  });
  it.each<[string, Partial<MissingInputFacts>, string]>([
    ['no stored intent', { intent: null }, 'intent_missing'],
    ['intent for another SHA', { intent: { classifiedForSha: 'other' } }, 'intent_other_sha'],
    ['blast degraded', { blast: { degraded: true, reason: 'index_partial' } }, 'blast_degraded'],
    ['blast unavailable', { blast: null }, 'blast_degraded'],
    ['no spec docs', { specCount: 0 }, 'specs_missing'],
    ['empty description', { description: '  ' }, 'description_empty'],
    ['null description', { description: null }, 'description_empty'],
    ['no linked issue', { issue: { status: 'none' } }, 'issue_not_referenced'],
    ['unreachable issue', { issue: { status: 'unreachable' } }, 'issue_unreachable'],
    ['more than 200 files', { totalFiles: 201 }, 'files_truncated'],
    ['trimmed prompt', { promptTrimmed: true }, 'prompt_trimmed'],
  ])('AC-25: %s -> %s', (_n, facts, kind) => {
    expect(kinds(facts)).toEqual([kind]);
  });
  it('AC-25: blast_degraded carries the reason', () => {
    expect(computeMissingInputs({ ...healthy, blast: { degraded: true, reason: 'index_partial' } })).toEqual([
      { kind: 'blast_degraded', reason: 'index_partial' },
    ]);
  });
  it('AC-25: exactly 200 files is not truncated', () => {
    expect(kinds({ totalFiles: 200 })).toEqual([]);
  });
});

describe('orderFiles', () => {
  it('EC-19 / Q-F: core, wiring, tests, docs, boilerplate, then path ascending', () => {
    const files = [
      { path: 'z.md', role: 'docs' as const },
      { path: 'b.ts', role: 'core' as const },
      { path: 'a.test.ts', role: 'tests' as const },
      { path: 'a.ts', role: 'core' as const },
      { path: 'lock', role: 'boilerplate' as const },
      { path: 'index.ts', role: 'wiring' as const },
    ];
    expect(orderFiles(files).map((f) => f.path)).toEqual(['a.ts', 'b.ts', 'index.ts', 'a.test.ts', 'z.md', 'lock']);
  });
});
