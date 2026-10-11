import { describe, it, expect } from 'vitest';
import { diffSkills } from './skills-diff.js';

/** SPEC-08 AC-49 — skills added / removed / changed between two snapshots, matched by name. */
const s = (name: string, body = `${name} body`) => ({ name, body });

describe('diffSkills', () => {
  it('AC-49: identical lists → nothing changed', () => {
    expect(diffSkills([s('a'), s('b')], [s('a'), s('b')])).toEqual({
      added: [],
      removed: [],
      changed: [],
    });
  });

  it('AC-49: added and removed are matched by name', () => {
    expect(diffSkills([s('a'), s('b')], [s('b'), s('c')])).toEqual({
      added: ['c'],
      removed: ['a'],
      changed: [],
    });
  });

  it('AC-49: a skill present in both with a different body is changed', () => {
    expect(diffSkills([s('a', 'v1'), s('b')], [s('a', 'v2'), s('b')])).toEqual({
      added: [],
      removed: [],
      changed: ['a'],
    });
  });

  it('AC-49: reordering the skills both runs share counts as changed (no separate reordered list)', () => {
    const r = diffSkills([s('a'), s('b')], [s('b'), s('a')]);
    expect(r.added).toEqual([]);
    expect(r.removed).toEqual([]);
    expect(r.changed.sort()).toEqual(['a', 'b']);
    expect(r).not.toHaveProperty('reordered');
  });

  it('AC-49: adding a skill does not by itself flag the untouched ones as reordered', () => {
    expect(diffSkills([s('a'), s('b')], [s('a'), s('new'), s('b')])).toEqual({
      added: ['new'],
      removed: [],
      changed: [],
    });
  });

  it('empty on either side', () => {
    expect(diffSkills([], [s('a')])).toEqual({ added: ['a'], removed: [], changed: [] });
    expect(diffSkills([s('a')], [])).toEqual({ added: [], removed: ['a'], changed: [] });
    expect(diffSkills([], [])).toEqual({ added: [], removed: [], changed: [] });
  });
});
