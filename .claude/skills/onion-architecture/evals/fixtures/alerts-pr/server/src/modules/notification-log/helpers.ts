import type { NotificationLogRow, FindingRow } from '../../db/rows.js';

export interface NotificationLogDto {
  id: string;
  channel: string;
  findingId: string;
  sentAt: string;
}

export function toNotificationLogDto(row: NotificationLogRow): NotificationLogDto {
  return {
    id: row.id,
    channel: row.channel,
    findingId: row.findingId,
    sentAt: row.sentAt.toISOString(),
  };
}

export function dedupeKeyFor(finding: Pick<FindingRow, 'id' | 'severity'>, channel: string): string {
  return `${channel}:${finding.severity}:${finding.id}`;
}

export function clampPageSize(requested: number | undefined, fallback: number, max: number): number {
  if (!requested || requested < 1) return fallback;
  return Math.min(requested, max);
}
