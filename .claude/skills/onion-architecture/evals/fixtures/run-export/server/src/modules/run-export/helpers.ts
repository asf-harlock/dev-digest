import type { exportPresets } from '../../db/schema.js';
import type { ReviewRow } from '../../db/rows.js';

type PresetRow = typeof exportPresets.$inferSelect;

export interface PresetDto {
  id: string;
  name: string;
  format: string;
  createdAt: string;
}

export interface ExportLine {
  reviewId: string;
  verdict: string | null;
  createdAt: string;
}

export function toPresetDto(row: PresetRow): PresetDto {
  return {
    id: row.id,
    name: row.name,
    format: row.format,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toExportLine(row: ReviewRow): ExportLine {
  return {
    reviewId: row.id,
    verdict: row.verdict ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toCsv(lines: ExportLine[]): string {
  const header = 'review_id,verdict,created_at';
  const body = lines.map((l) => `${l.reviewId},${l.verdict ?? ''},${l.createdAt}`);
  return [header, ...body].join('\n');
}
