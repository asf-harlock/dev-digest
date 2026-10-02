import { describe, it, expect } from 'vitest';
import {
  buildAttachableList,
  computeSuggestions,
  extractSpecReferences,
  validatePrContextPath,
} from './pr-context-paths.js';

const rules = { globs: ['**/{specs,docs,insights}/**/*.md'], excludes: ['node_modules', '.git'] };

describe('validatePrContextPath', () => {
  it('accepts a clean specs path', () => {
    expect(validatePrContextPath('specs/07-pr-context.md', rules).ok).toBe(true);
  });
  it.each([
    ['../specs/a.md'],
    ['specs/../a.md'],
    [':(top)specs/a.md'],
    ['specs\\a.md'],
    ['specs/a\u0000.md'],
    ['specs/a\n.md'],
    ['specs/a.txt'],
    ['/specs/a.md'],
    ['node_modules/specs/a.md'],
    ['README.md'],
    [`specs/${'a'.repeat(520)}.md`],
  ])('rejects %j', (p) => {
    expect(validatePrContextPath(p, rules).ok).toBe(false);
  });
});

describe('extractSpecReferences', () => {
  it('extracts only SPEC-NN and specs/NN- tokens', () => {
    const refs = extractSpecReferences('Implements SPEC-07, see specs/04-x.md and http://evil/?q=SPEC-xx');
    expect(refs.map((r) => r.number)).toEqual([7, 4]);
  });
});

describe('computeSuggestions', () => {
  const attachable = buildAttachableList(
    ['specs/07-pr-context.md', 'docs/a.md'],
    [
      { path: 'specs/08-new.md', status: 'added' },
      { path: 'src/x.ts', status: 'modified' },
      { path: 'docs/b.md', status: 'modified' },
      { path: 'docs/gone.md', status: 'removed' },
    ],
    rules,
  );
  it('marks changed paths and sorts', () => {
    expect(attachable.map((a) => [a.path, a.origin])).toEqual([
      ['docs/a.md', 'default_branch'],
      ['docs/b.md', 'modified'],
      ['specs/07-pr-context.md', 'default_branch'],
      ['specs/08-new.md', 'added'],
    ]);
  });
  it('suggests a changed spec and a resolved reference, not attached ones', () => {
    const s = computeSuggestions({
      attachable,
      attached: [],
      changedPaths: ['specs/08-new.md', 'docs/b.md'],
      title: 'Add context (SPEC-07)',
      body: null,
      branch: 'feat/x',
    });
    expect(s.map((x) => x.path)).toEqual(['specs/08-new.md', 'specs/07-pr-context.md']);
    expect(
      computeSuggestions({ attachable, attached: ['specs/08-new.md'], changedPaths: ['specs/08-new.md'], title: '', body: null, branch: '' }),
    ).toEqual([]);
  });
  it('adds nothing for an unresolved reference (EC-26)', () => {
    expect(
      computeSuggestions({ attachable, attached: [], changedPaths: [], title: 'SPEC-99', body: 'specs/98-x', branch: '' }),
    ).toEqual([]);
  });
});
