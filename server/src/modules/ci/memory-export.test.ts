import { describe, it, expect } from 'vitest';
import { buildMemoryExport, type MemoryExportRow } from './memory-export.js';

const row = (i: number, over: Partial<MemoryExportRow> = {}): MemoryExportRow => ({
  id: `id-${String(i).padStart(4, '0')}`,
  kind: 'decision',
  content: `fact ${i}`,
  confidence: 0.5,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
  ...over,
});

describe('buildMemoryExport', () => {
  it('is empty for no rows (EC-16)', () => {
    expect(buildMemoryExport([])).toEqual({ contents: '', count: 0, total: 0, truncated: false, empty: true });
  });

  it('writes one escaped JSON line per row (AC-30, UI-5)', () => {
    const out = buildMemoryExport([row(1, { content: 'line1\nline2 "q" \u2028 end' })]);
    const lines = out.contents.split('\n');
    expect(lines).toHaveLength(2); // one line + trailing newline
    expect(lines[1]).toBe('');
    expect(out.contents).not.toMatch(/\u2028/);
    expect(JSON.parse(lines[0]!)).toMatchObject({ kind: 'decision', content: 'line1\nline2 "q" \u2028 end' });
  });

  it('is newest first and independent of input order (NFR-5)', () => {
    const a = buildMemoryExport([row(1), row(3), row(2)]);
    const b = buildMemoryExport([row(2), row(1), row(3)]);
    expect(a.contents).toBe(b.contents);
    expect(a.contents.split('\n').map((l) => (l ? JSON.parse(l).content : l))).toEqual(['fact 3', 'fact 2', 'fact 1', '']);
  });

  it('breaks created_at ties by id', () => {
    const t = new Date(0);
    const out = buildMemoryExport([row(2, { created_at: t }), row(1, { created_at: t })]);
    expect(out.contents.split('\n')[0]).toContain('id-0001');
  });

  it('caps at the 500 newest and flags truncation (EC-17)', () => {
    const rows = Array.from({ length: 501 }, (_, i) => row(i));
    const out = buildMemoryExport(rows);
    expect(out.count).toBe(500);
    expect(out.truncated).toBe(true);
    expect(out.total).toBe(501);
    expect(out.contents).not.toContain('"fact 0"');
    expect(out.contents).toContain('"fact 500"');
  });

  it('uses the caller-supplied total when the query already capped the rows', () => {
    const out = buildMemoryExport(Array.from({ length: 500 }, (_, i) => row(i)), 800);
    expect(out).toMatchObject({ count: 500, total: 800, truncated: true });
  });

  it('accepts ISO strings', () => {
    const out = buildMemoryExport([row(1, { created_at: '2026-01-01T00:00:01.000Z' })]);
    expect(JSON.parse(out.contents.trim()).created_at).toBe('2026-01-01T00:00:01.000Z');
  });
});
