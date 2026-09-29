import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  DEFAULT_CONTEXT_EXCLUDES,
  DEFAULT_CONTEXT_GLOBS,
  loadConfig,
  splitTopLevelCommas,
} from '../src/platform/config.js';
import { matchesAnyGlob } from '../src/modules/_shared/context-paths.js';

const DEFAULT_GLOB = '**/{specs,docs,insights}/**/*.md';

describe('splitTopLevelCommas', () => {
  it('psr-backend: CONTEXT_GLOBS keeps commas inside braces', () => {
    expect(splitTopLevelCommas(DEFAULT_GLOB)).toEqual([DEFAULT_GLOB]);
    expect(splitTopLevelCommas(DEFAULT_CONTEXT_GLOBS.join(','))).toEqual([DEFAULT_GLOB]);
  });

  it('SPEC-04: splits only at depth 0', () => {
    expect(splitTopLevelCommas('**/{specs,docs}/**/*.md,notes/*.md')).toEqual([
      '**/{specs,docs}/**/*.md',
      'notes/*.md',
    ]);
  });

  it('SPEC-04: trims items and drops empties', () => {
    expect(splitTopLevelCommas(' a , ,b ')).toEqual(['a', 'b']);
    expect(splitTopLevelCommas(',,')).toEqual([]);
    expect(splitTopLevelCommas('')).toEqual([]);
  });

  it('SPEC-04: brace group at the start and at the end', () => {
    expect(splitTopLevelCommas('{a,b}/x.md,y.md')).toEqual(['{a,b}/x.md', 'y.md']);
    expect(splitTopLevelCommas('y.md,x/{a,b}')).toEqual(['y.md', 'x/{a,b}']);
  });

  it.each([
    ['unbalanced "{"', 'a/{b,c'],
    ['stray "}"', 'a/b}'],
    ['nested "{"', '{a,{b,c}}'],
  ])('SPEC-04: throws on %s', (_n, input) => {
    expect(() => splitTopLevelCommas(input)).toThrow(Error);
  });
});

describe('loadConfig CONTEXT_GLOBS / CONTEXT_EXCLUDES', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace-only', '   '],
    ['only commas', ' , ,'],
  ])('SPEC-04: %s falls back to the defaults', (_n, v) => {
    const cfg = loadConfig({ CONTEXT_GLOBS: v, CONTEXT_EXCLUDES: v } as NodeJS.ProcessEnv);
    expect(cfg.contextGlobs).toEqual(DEFAULT_CONTEXT_GLOBS);
    expect(cfg.contextExcludes).toEqual(DEFAULT_CONTEXT_EXCLUDES);
  });

  it('psr-backend: loadConfig keeps the brace glob whole', () => {
    const cfg = loadConfig({ CONTEXT_GLOBS: DEFAULT_GLOB } as NodeJS.ProcessEnv);
    expect(cfg.contextGlobs).toEqual([DEFAULT_GLOB]);
  });

  it('SPEC-04: CONTEXT_EXCLUDES plain split still works', () => {
    const cfg = loadConfig({ CONTEXT_EXCLUDES: ' out , tmp,,cache ' } as NodeJS.ProcessEnv);
    expect(cfg.contextExcludes).toEqual(['out', 'tmp', 'cache']);
    expect(cfg.contextGlobs).toEqual(DEFAULT_CONTEXT_GLOBS);
  });

  it.each(['a/{b,c', 'a}', '{a,{b,c}}'])('SPEC-04: malformed %j throws a ZodError', (bad) => {
    for (const key of ['CONTEXT_GLOBS', 'CONTEXT_EXCLUDES']) {
      let err: unknown;
      try {
        loadConfig({ [key]: bad } as NodeJS.ProcessEnv);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(ZodError);
      expect((err as ZodError).message).toContain('invalid comma-separated list');
    }
  });

  it('SPEC-04: every parsed glob is accepted by the real matcher', () => {
    const inputs = [undefined, DEFAULT_GLOB, '**/{specs,docs}/**/*.md,notes/*.md'];
    for (const v of inputs) {
      const { contextGlobs } = loadConfig({ CONTEXT_GLOBS: v } as NodeJS.ProcessEnv);
      expect(matchesAnyGlob('docs/a.md', contextGlobs)).toBe(true);
      expect(matchesAnyGlob('a/b/specs/c/d.md', contextGlobs)).toBe(true);
      expect(matchesAnyGlob('README.md', contextGlobs)).toBe(false);
    }
  });
});
