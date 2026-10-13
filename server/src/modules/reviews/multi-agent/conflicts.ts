import type { Conflict, ConflictTake, FindingRecord, Severity } from '@devdigest/shared';
import { FILE_SCOPED_KINDS, FILE_SCOPED_SPAN_LINES, NOTE_ELLIPSIS, NOTE_MAX_CHARS } from '../constants.js';

/**
 * Where agents disagree (AC-30…AC-36) — pure, computed at read time from the
 * persisted findings of the `done` columns; never stored, never calls a model
 * (NFR-1).
 */

/** The slice of a `done` column the grouping needs. `persona` = the agent name. */
export interface ConflictColumn {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  findings: FindingRecord[];
}

/** Higher = more severe. */
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

interface Entry {
  column: ConflictColumn;
  finding: FindingRecord;
}

const byId = (a: FindingRecord, b: FindingRecord) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Most severe first; tie → smallest finding id (AC-33). */
function moreSevere(a: FindingRecord, b: FindingRecord): number {
  return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || byId(a, b);
}

function isFileScoped(f: FindingRecord): boolean {
  if (f.kind && FILE_SCOPED_KINDS.includes(f.kind)) return true;
  return f.end_line - f.start_line + 1 > FILE_SCOPED_SPAN_LINES;
}

/** First line of a rationale, capped at NOTE_MAX_CHARS including the ellipsis (AC-34). */
export function noteOf(rationale: string): string {
  const first = rationale.split(/\r?\n/).find((l) => l.trim() !== '')?.trim() ?? '';
  if (first.length <= NOTE_MAX_CHARS) return first;
  return first.slice(0, NOTE_MAX_CHARS - NOTE_ELLIPSIS.length) + NOTE_ELLIPSIS;
}

/** Split one file's line-scoped entries into groups of overlapping ranges (sort + sweep, AC-31). */
function sweep(entries: Entry[]): Entry[][] {
  const sorted = [...entries].sort(
    (a, b) => a.finding.start_line - b.finding.start_line || byId(a.finding, b.finding),
  );
  const groups: Entry[][] = [];
  let current: Entry[] = [];
  let maxEnd = -Infinity;
  for (const e of sorted) {
    if (current.length > 0 && e.finding.start_line > maxEnd) {
      groups.push(current);
      current = [];
      maxEnd = -Infinity;
    }
    current.push(e);
    maxEnd = Math.max(maxEnd, e.finding.end_line);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/** Bucket entries into raw groups: line-scoped per file by overlap, file-scoped per file + kind. */
function groupEntries(entries: Entry[]): Entry[][] {
  const lineScoped = new Map<string, Entry[]>();
  const fileScoped = new Map<string, Entry[]>();
  for (const e of entries) {
    const f = e.finding;
    const bucket = isFileScoped(f) ? fileScoped : lineScoped;
    const key = bucket === fileScoped ? `${f.file}\u0000${f.kind ?? 'finding'}` : f.file;
    const list = bucket.get(key);
    if (list) list.push(e);
    else bucket.set(key, [e]);
  }
  return [...[...lineScoped.values()].flatMap(sweep), ...fileScoped.values()];
}

function toConflict(group: Entry[], columns: ConflictColumn[]): Conflict {
  // The anchor: smallest start line among the flagging findings, tie → smallest id.
  const anchor = group
    .map((e) => e.finding)
    .sort((a, b) => a.start_line - b.start_line || byId(a, b))[0]!;

  const takes: ConflictTake[] = columns.map((col) => {
    const mine = group.filter((e) => e.column === col).map((e) => e.finding);
    const rep = mine.sort(moreSevere)[0];
    return {
      run_id: col.run_id,
      agent_id: col.agent_id,
      persona: col.agent_name,
      verdict: rep ? rep.severity : 'ignored',
      note: rep ? noteOf(rep.rationale) : '',
      dismissed: rep ? rep.dismissed_at != null : false,
    };
  });

  const flagging = takes.filter((tk) => tk.verdict !== 'ignored');
  const severities = new Set(flagging.map((tk) => tk.verdict));
  const contended =
    (flagging.length >= 1 && flagging.length < takes.length) ||
    (flagging.length >= 2 && severities.size >= 2);

  return { file: anchor.file, line: anchor.start_line, title: anchor.title, contended, takes };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Groups the findings of the `done` columns by location. Returns every group
 * with at least one flagging agent, sorted by file, line, title; `[]` when
 * fewer than 2 columns are given (AC-30). Pass only `done` columns — failed,
 * cancelled and running ones are excluded by the caller (EC-10).
 */
export function computeConflicts(doneColumns: ConflictColumn[]): Conflict[] {
  if (doneColumns.length < 2) return [];
  const entries = doneColumns.flatMap((column) => column.findings.map((finding) => ({ column, finding })));
  return groupEntries(entries)
    .map((group) => toConflict(group, doneColumns))
    .sort((a, b) => cmp(a.file, b.file) || a.line - b.line || cmp(a.title, b.title));
}
