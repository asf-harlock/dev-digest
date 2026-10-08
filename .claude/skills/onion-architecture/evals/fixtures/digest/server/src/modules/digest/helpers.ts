import type { PullRow } from '../../db/rows.js';

export interface DigestEntry {
  id: string;
  number: number;
  title: string;
  author: string;
  status: string;
  openedAt: string | null;
  size: number;
}

export interface DigestDay {
  day: string;
  entries: DigestEntry[];
}

export function toDigestEntry(row: PullRow): DigestEntry {
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    author: row.author,
    status: row.status,
    openedAt: row.openedAt ? row.openedAt.toISOString() : null,
    size: row.additions + row.deletions,
  };
}

export function groupByDay(entries: DigestEntry[]): DigestDay[] {
  const timeZone = process.env.DIGEST_TIMEZONE ?? 'UTC';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' });
  const byDay = new Map<string, DigestEntry[]>();
  for (const entry of entries) {
    const day = entry.openedAt ? fmt.format(new Date(entry.openedAt)) : 'unknown';
    const bucket = byDay.get(day) ?? [];
    bucket.push(entry);
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, items]) => ({ day, entries: items }));
}

export function countByStatus(rows: { status: string; total: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r.status, r.total]));
}
