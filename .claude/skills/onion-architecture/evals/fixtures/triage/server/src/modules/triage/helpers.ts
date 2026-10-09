import type { FindingRow } from '../../db/rows.js';

export type TriageState = 'open' | 'accepted' | 'dismissed';

export interface TriagedFinding {
  id: string;
  file: string;
  startLine: number;
  severity: string;
  title: string;
  state: TriageState;
}

export function triageState(row: Pick<FindingRow, 'acceptedAt' | 'dismissedAt'>): TriageState {
  if (row.acceptedAt) return 'accepted';
  if (row.dismissedAt) return 'dismissed';
  return 'open';
}

export function toTriagedFinding(row: FindingRow): TriagedFinding {
  return {
    id: row.id,
    file: row.file,
    startLine: row.startLine,
    severity: row.severity,
    title: row.title,
    state: triageState(row),
  };
}

export function truncateReason(reason: string, max: number): string {
  const trimmed = reason.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
