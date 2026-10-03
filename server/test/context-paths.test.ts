import { describe, it, expect } from 'vitest';
import {
  MAX_LOGGED_PATH_LENGTH,
  MAX_CONTEXT_PATH_LENGTH,
  dedupePaths,
  globToRegExp,
  kindForPath,
  matchesAnyGlob,
  samePathList,
  sanitizePathForLog,
  validateContextPath,
  firstInvalidContextPath,
} from '../src/modules/_shared/context-paths.js';
import { DEFAULT_CONTEXT_EXCLUDES, DEFAULT_CONTEXT_GLOBS, loadConfig } from '../src/platform/config.js';

const RULES = { globs: DEFAULT_CONTEXT_GLOBS, excludes: DEFAULT_CONTEXT_EXCLUDES };

describe('SPEC-04 glob matcher', () => {
  it('AC-1: default glob matches specs/docs/insights markdown at any depth, including zero-depth prefix', () => {
    for (const p of [
      'docs/a.md',
      'specs/a.md',
      'insights/a.md',
      'server/docs/a.md',
      'a/b/c/specs/d/e/f.md',
    ]) {
      expect(matchesAnyGlob(p, RULES.globs), p).toBe(true);
    }
    for (const p of ['README.md', 'src/a.md', 'docs/a.txt', 'docsx/a.md']) {
      expect(matchesAnyGlob(p, RULES.globs), p).toBe(false);
    }
  });

  it('`**/` matches zero directories, `*` does not cross `/`, `{a,b}` alternates', () => {
    expect(globToRegExp('**/x.md').test('x.md')).toBe(true);
    expect(globToRegExp('**/x.md').test('a/b/x.md')).toBe(true);
    expect(globToRegExp('docs/*.md').test('docs/a.md')).toBe(true);
    expect(globToRegExp('docs/*.md').test('docs/sub/a.md')).toBe(false);
    expect(globToRegExp('{a,b}/*.md').test('b/z.md')).toBe(true);
    expect(globToRegExp('{a,b}/*.md').test('c/z.md')).toBe(false);
  });

  it('regex specials in a glob are literals (no injection through "." or "+")', () => {
    expect(globToRegExp('docs/a.md').test('docs/aXmd')).toBe(false);
    expect(globToRegExp('docs/a+b.md').test('docs/a+b.md')).toBe(true);
  });

  it('an unbalanced "{" is rejected loudly', () => {
    expect(() => globToRegExp('docs/{a,b.md')).toThrow();
  });
});

describe('SPEC-04 validateContextPath (UI-1, NFR-5)', () => {
  const bad: [string, unknown][] = [
    ['empty', ''],
    ['non-string', 42],
    ['absolute', '/etc/docs/passwd.md'],
    ['drive letter', 'C:docs/a.md'],
    ['dot-dot segment', 'docs/../secret/a.md'],
    ['leading dot-dot', '../docs/a.md'],
    ['dot segment', 'docs/./a.md'],
    ['empty segment', 'docs//a.md'],
    ['backslash', 'docs\\a.md'],
    ['newline', 'docs/a\n.md'],
    ['NUL', 'docs/a\u0000.md'],
    ['not markdown', 'docs/a.txt'],
    ['excluded dir', 'node_modules/docs/a.md'],
    ['excluded dir deep', 'docs/vendor/a.md'],
    ['outside globs', 'src/a.md'],
    ['too long', `docs/${'a'.repeat(MAX_CONTEXT_PATH_LENGTH)}.md`],
  ];
  it.each(bad)('UI-1: rejects %s', (_n, p) => {
    expect(validateContextPath(p, RULES).ok).toBe(false);
  });

  it('accepts a clean matching path', () => {
    expect(validateContextPath('docs/architecture-invariants.md', RULES)).toEqual({ ok: true });
  });

  it('firstInvalidContextPath returns the sanitized first offender, undefined when all fine', () => {
    expect(firstInvalidContextPath(['docs/a.md', 'docs/b.md'], RULES)).toBeUndefined();
    const r = firstInvalidContextPath(['docs/a.md', 'docs/x\ny.txt'], RULES);
    expect(r?.path).toBe('docs/x?y.txt');
  });

  it('excludes come from config: CONTEXT_EXCLUDES / CONTEXT_GLOBS env override defaults', () => {
    const cfg = loadConfig({ NODE_ENV: 'test', CONTEXT_GLOBS: 'notes/**/*.md, x/*.md', CONTEXT_EXCLUDES: 'tmp' } as NodeJS.ProcessEnv);
    expect(cfg.contextGlobs).toEqual(['notes/**/*.md', 'x/*.md']);
    expect(cfg.contextExcludes).toEqual(['tmp']);
    const rules = { globs: cfg.contextGlobs, excludes: cfg.contextExcludes };
    expect(validateContextPath('notes/a.md', rules).ok).toBe(true);
    expect(validateContextPath('docs/a.md', rules).ok).toBe(false);
    expect(validateContextPath('notes/tmp/a.md', rules).ok).toBe(false);
  });
});

describe('SPEC-04 kindForPath', () => {
  it.each([
    ['AC-3: specs', 'specs/a.md', 'specs'],
    ['AC-3: docs', 'docs/a.md', 'docs'],
    ['AC-3: insights', 'server/insights/a.md', 'insights'],
    ['AC-3: nearest segment wins', 'docs/specs/a.md', 'specs'],
    ['AC-3: nearest segment wins (reverse)', 'specs/docs/deep/a.md', 'docs'],
    ['AC-3: file named like a kind is not a directory', 'other/specs.md', 'docs'],
    ['AC-3: no kind dir falls back to docs', 'notes/a.md', 'docs'],
  ])('%s', (_n, path, kind) => {
    expect(kindForPath(path)).toBe(kind);
  });
});

describe('SPEC-04 sanitizePathForLog (UI-7)', () => {
  it('UI-7: replaces newlines and control chars so a file name cannot forge a log line', () => {
    const out = sanitizePathForLog('docs/a\nINFO forged\r\u0007[31m.md');
    expect(out).not.toMatch(/[\n\r\t]/);
    expect(out).toContain('docs/a?INFO forged??[31m.md');
  });
  it('UI-7: truncates long names', () => {
    const out = sanitizePathForLog('a'.repeat(MAX_LOGGED_PATH_LENGTH + 50));
    expect(out.length).toBe(MAX_LOGGED_PATH_LENGTH + 1);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('SPEC-04 list helpers', () => {
  it('dedupePaths keeps first occurrence and order', () => {
    expect(dedupePaths(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });
  it('samePathList is order-sensitive', () => {
    expect(samePathList(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(samePathList(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(samePathList(['a'], ['a', 'b'])).toBe(false);
  });
});
