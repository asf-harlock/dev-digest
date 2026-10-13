import { describe, it, expect } from 'vitest';
import type { FindingRecord } from '@devdigest/shared';
import { computeConflicts, noteOf, type ConflictColumn } from '../src/modules/reviews/multi-agent/conflicts.js';
import { NOTE_ELLIPSIS, NOTE_MAX_CHARS } from '../src/modules/reviews/constants.js';

/**
 * SPEC-11 "Where agents disagree" (AC-30…AC-36). `computeConflicts` is pure: it
 * takes the `done` columns and their persisted findings and groups them at read
 * time — no DB, no model (NFR-1).
 */

let seq = 0;
function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  seq += 1;
  return {
    id: `f-${String(seq).padStart(4, '0')}`,
    severity: 'WARNING',
    category: 'bug',
    title: 'A finding',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 10,
    rationale: 'Because.',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifecta_components: null,
    evidence: null,
    review_id: 'rev-1',
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function column(name: string | null, findings: FindingRecord[], over: Partial<ConflictColumn> = {}): ConflictColumn {
  return {
    run_id: `run-${name ?? 'deleted'}`,
    agent_id: name === null ? null : `agent-${name}`,
    agent_name: name,
    findings,
    ...over,
  };
}

describe('computeConflicts', () => {
  describe('AC-30: fewer than 2 done columns', () => {
    it('AC-30: no columns, or a single column, gives no conflicts', () => {
      expect(computeConflicts([])).toEqual([]);
      expect(computeConflicts([column('sec', [finding()])])).toEqual([]);
    });

    it('AC-30: two columns that flagged nothing give no groups', () => {
      expect(computeConflicts([column('sec', []), column('perf', [])])).toEqual([]);
    });
  });

  describe('AC-31: line-scoped overlap', () => {
    it('AC-31: inclusive ranges that touch on one line share a group; a gap of one line splits them', () => {
      const a = column('a', [finding({ start_line: 5, end_line: 10 })]);
      const b = column('b', [finding({ start_line: 10, end_line: 12 })]);
      const grouped = computeConflicts([a, b]);
      expect(grouped).toHaveLength(1);
      expect(grouped[0]!.takes.map((t) => t.verdict)).toEqual(['WARNING', 'WARNING']);

      const c = column('c', [finding({ start_line: 5, end_line: 10 })]);
      const d = column('d', [finding({ start_line: 11, end_line: 12 })]);
      const split = computeConflicts([c, d]);
      expect(split).toHaveLength(2);
      expect(split.map((g) => g.line)).toEqual([5, 11]);
    });

    it('AC-31: a long range bridges findings that do not overlap each other (sort + sweep)', () => {
      const a = column('a', [
        finding({ start_line: 1, end_line: 5 }),
        finding({ start_line: 18, end_line: 19 }),
      ]);
      const b = column('b', [finding({ start_line: 4, end_line: 20 })]);
      const groups = computeConflicts([a, b]);
      expect(groups).toHaveLength(1);
      expect(groups[0]!.line).toBe(1);
    });

    it('AC-31: the same lines in different files never share a group', () => {
      const a = column('a', [finding({ file: 'src/a.ts' })]);
      const b = column('b', [finding({ file: 'src/b.ts' })]);
      const groups = computeConflicts([a, b]);
      expect(groups.map((g) => g.file)).toEqual(['src/a.ts', 'src/b.ts']);
    });
  });

  describe('AC-32: file-scoped findings', () => {
    it.each(['secret_leak', 'lethal_trifecta', 'phantom', 'hook'] as const)(
      'AC-32: kind %s groups per file regardless of its lines',
      (kind) => {
        const a = column('a', [finding({ kind, start_line: 3, end_line: 3 })]);
        const b = column('b', [finding({ kind, start_line: 400, end_line: 400 })]);
        const groups = computeConflicts([a, b]);
        expect(groups).toHaveLength(1);
        expect(groups[0]!.takes.every((t) => t.verdict !== 'ignored')).toBe(true);
      },
    );

    it('AC-32: different file-scoped kinds in one file form separate groups', () => {
      const a = column('a', [finding({ kind: 'secret_leak', title: 'leak' })]);
      const b = column('b', [finding({ kind: 'hook', title: 'hook' })]);
      const groups = computeConflicts([a, b]);
      expect(groups).toHaveLength(2);
      expect(groups.every((g) => g.contended)).toBe(true);
    });

    it('AC-32: a span of exactly 50 lines is line-scoped, 51 lines is file-scoped', () => {
      // 1..50 and 100..101 do not overlap → two line-scoped groups.
      const lineScoped = computeConflicts([
        column('a', [finding({ start_line: 1, end_line: 50 })]),
        column('b', [finding({ start_line: 100, end_line: 101 })]),
      ]);
      expect(lineScoped).toHaveLength(2);

      // 1..51 is 51 lines long → file-scoped; it pairs with another file-scoped
      // finding of the same file and kind wherever that one sits.
      const fileScoped = computeConflicts([
        column('a', [finding({ start_line: 1, end_line: 51 })]),
        column('b', [finding({ start_line: 300, end_line: 360 })]),
      ]);
      expect(fileScoped).toHaveLength(1);
    });

    it('AC-32: a line-scoped finding does not join the file-scoped group of its own file', () => {
      const a = column('a', [finding({ kind: 'secret_leak', start_line: 5, end_line: 5 })]);
      const b = column('b', [finding({ kind: 'finding', start_line: 5, end_line: 5 })]);
      expect(computeConflicts([a, b])).toHaveLength(2);
    });
  });

  describe('AC-33: one take per agent and group', () => {
    it('AC-33: the most severe finding is the take, and every finding stays in its column', () => {
      const warn = finding({ severity: 'WARNING', start_line: 10, end_line: 10, rationale: 'warn note' });
      const crit = finding({ severity: 'CRITICAL', start_line: 11, end_line: 12, rationale: 'crit note' });
      const sugg = finding({ severity: 'SUGGESTION', start_line: 10, end_line: 11, rationale: 'sugg note' });
      const a = column('a', [warn, crit, sugg]);
      const b = column('b', []);

      const [group] = computeConflicts([a, b]);
      const take = group!.takes.find((t) => t.run_id === a.run_id)!;
      expect(take.verdict).toBe('CRITICAL');
      expect(take.note).toBe('crit note');
      // The input is read-only: nothing was removed from the column.
      expect(a.findings).toEqual([warn, crit, sugg]);
    });

    it('AC-33: equal severity is broken by the smallest finding id', () => {
      const high = finding({ id: 'z-late', severity: 'WARNING', rationale: 'later id' });
      const low = finding({ id: 'a-early', severity: 'WARNING', rationale: 'earlier id' });
      const [group] = computeConflicts([column('a', [high, low]), column('b', [])]);
      expect(group!.takes[0]!.note).toBe('earlier id');
    });
  });

  describe('AC-34: takes and notes', () => {
    it('AC-34: every done column gets a take; a column that did not flag is `ignored` with an empty note', () => {
      const a = column('a', [finding({ severity: 'CRITICAL', rationale: 'bad' })]);
      const b = column('b', []);
      const c = column('c', [finding({ severity: 'SUGGESTION', rationale: 'meh' })]);
      const [group] = computeConflicts([a, b, c]);
      expect(group!.takes.map((t) => [t.run_id, t.verdict, t.note])).toEqual([
        [a.run_id, 'CRITICAL', 'bad'],
        [b.run_id, 'ignored', ''],
        [c.run_id, 'SUGGESTION', 'meh'],
      ]);
      expect(group!.takes[1]).toMatchObject({ agent_id: 'agent-b', persona: 'b', dismissed: false });
    });

    it('AC-34: the note is the first non-empty line of the rationale', () => {
      expect(noteOf('First line\nSecond line')).toBe('First line');
      expect(noteOf('\r\n  \n  Real first line  \r\nmore')).toBe('Real first line');
      expect(noteOf('')).toBe('');
    });

    it('AC-34: a note of exactly 160 characters is kept as is', () => {
      const exact = 'x'.repeat(NOTE_MAX_CHARS);
      expect(noteOf(exact)).toBe(exact);
    });

    it('AC-34: a longer note is cut to 160 characters, ellipsis included', () => {
      const note = noteOf('y'.repeat(NOTE_MAX_CHARS + 40));
      expect(note).toHaveLength(NOTE_MAX_CHARS);
      expect(note.endsWith(NOTE_ELLIPSIS)).toBe(true);
      expect(note).toBe('y'.repeat(NOTE_MAX_CHARS - NOTE_ELLIPSIS.length) + NOTE_ELLIPSIS);
    });

    it('AC-34: `dismissed` follows the representative finding, not any finding of the agent', () => {
      const dismissedAt = '2026-01-01T00:00:00.000Z';
      // The representative is the CRITICAL one (not dismissed); the dismissed one is only a WARNING.
      const crit = finding({ severity: 'CRITICAL', start_line: 10, end_line: 10 });
      const warn = finding({ severity: 'WARNING', start_line: 10, end_line: 10, dismissed_at: dismissedAt });
      const [notDismissed] = computeConflicts([column('a', [crit, warn]), column('b', [])]);
      expect(notDismissed!.takes[0]!.dismissed).toBe(false);

      const onlyDismissed = finding({ severity: 'WARNING', dismissed_at: dismissedAt });
      const [dismissed] = computeConflicts([column('a', [onlyDismissed]), column('b', [])]);
      expect(dismissed!.takes[0]!.dismissed).toBe(true);
      // A dismissed finding is still listed (EC-24): the group exists.
      expect(dismissed!.takes[0]!.verdict).toBe('WARNING');
    });

    it('AC-34: a column of a deleted agent is keyed by run_id with null agent_id and persona', () => {
      const orphan = column(null, [finding({ severity: 'CRITICAL' })]);
      const other = column('b', []);
      const [group] = computeConflicts([orphan, other]);
      expect(group!.takes[0]).toMatchObject({
        run_id: 'run-deleted',
        agent_id: null,
        persona: null,
        verdict: 'CRITICAL',
      });
    });
  });

  describe('AC-35: contended', () => {
    it('AC-35: one agent flagged and another done agent did not → contended', () => {
      const [g] = computeConflicts([column('a', [finding()]), column('b', [])]);
      expect(g!.contended).toBe(true);
    });

    it('AC-35: two agents flagged with the same severity → not contended', () => {
      const [g] = computeConflicts([column('a', [finding({ severity: 'WARNING' })]), column('b', [finding({ severity: 'WARNING' })])]);
      expect(g!.contended).toBe(false);
    });

    it('AC-35: two agents flagged with different severities → contended', () => {
      const [g] = computeConflicts([
        column('a', [finding({ severity: 'CRITICAL' })]),
        column('b', [finding({ severity: 'SUGGESTION' })]),
      ]);
      expect(g!.contended).toBe(true);
    });

    it('AC-35: two of three flagged with the same severity, the third did not → contended', () => {
      const [g] = computeConflicts([
        column('a', [finding({ severity: 'WARNING' })]),
        column('b', [finding({ severity: 'WARNING' })]),
        column('c', []),
      ]);
      expect(g!.contended).toBe(true);
    });

    it('AC-35: every group has at least one flagging agent', () => {
      const groups = computeConflicts([
        column('a', [finding({ file: 'one.ts' })]),
        column('b', [finding({ file: 'two.ts' })]),
      ]);
      for (const g of groups) expect(g.takes.some((t) => t.verdict !== 'ignored')).toBe(true);
    });
  });

  describe('AC-36: anchor and ordering', () => {
    it('AC-36: the group is anchored at the smallest start line among flagging findings, and takes its title', () => {
      const a = column('a', [finding({ title: 'Later one', start_line: 20, end_line: 30 })]);
      const b = column('b', [finding({ title: 'Earliest one', start_line: 15, end_line: 22 })]);
      const [g] = computeConflicts([a, b]);
      expect(g).toMatchObject({ file: 'src/a.ts', line: 15, title: 'Earliest one' });
    });

    it('AC-36: on a start-line tie the smallest finding id gives the title', () => {
      const a = column('a', [finding({ id: 'b-id', title: 'From b-id', start_line: 7, end_line: 9 })]);
      const b = column('b', [finding({ id: 'a-id', title: 'From a-id', start_line: 7, end_line: 8 })]);
      const [g] = computeConflicts([a, b]);
      expect(g!.title).toBe('From a-id');
    });

    it('AC-36: groups are sorted by file, then line, then title', () => {
      const a = column('a', [
        finding({ file: 'b.ts', start_line: 1, end_line: 1, title: 'x' }),
        finding({ file: 'a.ts', start_line: 40, end_line: 40, title: 'x' }),
        finding({ file: 'a.ts', start_line: 2, end_line: 2, title: 'zeta' }),
        finding({ file: 'a.ts', start_line: 2, end_line: 2, title: 'alpha', id: 'zz' }),
      ]);
      // same-line findings of one agent overlap → one group; use the second agent to split nothing.
      const b = column('b', []);
      const groups = computeConflicts([a, b]);
      expect(groups.map((g) => [g.file, g.line])).toEqual([
        ['a.ts', 2],
        ['a.ts', 40],
        ['b.ts', 1],
      ]);
    });

    it('AC-36: groups on the same file and line order by title', () => {
      // Two file-scoped kinds anchored at the same line, in the same file.
      const a = column('a', [
        finding({ kind: 'phantom', title: 'Zeta', start_line: 5, end_line: 5 }),
        finding({ kind: 'hook', title: 'Alpha', start_line: 5, end_line: 5 }),
      ]);
      const groups = computeConflicts([a, column('b', [])]);
      expect(groups.map((g) => g.title)).toEqual(['Alpha', 'Zeta']);
    });
  });
});
