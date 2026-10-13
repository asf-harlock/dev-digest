import { MEMORY_MAX_ROWS } from './constants.js';

/**
 * `.devdigest/memory.jsonl` (AC-30, UI-5, EC-16, EC-17): one escaped JSON line
 * per `scope='repo'` memory row, newest first, at most 500 rows.
 */

/** A repo-scoped memory row as the exporter needs it (the service maps the DB row to this). */
export interface MemoryExportRow {
  id: string;
  kind: string;
  content: string;
  confidence: number | null;
  created_at: Date | string;
}

export interface MemoryExport {
  contents: string;
  /** Lines written. */
  count: number;
  /** Rows the repository has in total (before the cap). */
  total: number;
  truncated: boolean;
  empty: boolean;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/** JSON.stringify never emits a raw newline; also escape the two JS line separators. */
function jsonLine(row: MemoryExportRow): string {
  return JSON.stringify({
    id: row.id,
    kind: row.kind,
    content: row.content,
    confidence: row.confidence,
    created_at: iso(row.created_at),
  })
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * `rows` may be a superset of what is exported; the 500 newest are selected here
 * (created_at desc, then id) so the output does not depend on query order.
 * `total` is the repository's real row count — pass `rows.length` when unknown.
 */
export function buildMemoryExport(
  rows: readonly MemoryExportRow[],
  total: number = rows.length,
): MemoryExport {
  const sorted = [...rows].sort((a, b) => {
    const ta = iso(a.created_at);
    const tb = iso(b.created_at);
    if (ta !== tb) return ta < tb ? 1 : -1; // newest first
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const picked = sorted.slice(0, MEMORY_MAX_ROWS);
  const realTotal = Math.max(total, rows.length);
  return {
    contents: picked.length === 0 ? '' : `${picked.map(jsonLine).join('\n')}\n`,
    count: picked.length,
    total: realTotal,
    truncated: realTotal > picked.length,
    empty: picked.length === 0,
  };
}
