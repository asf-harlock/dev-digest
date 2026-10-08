import type { Container } from '../../platform/container.js';
import type { AlertEventRow } from '../../db/rows.js';
import { DEFAULT_ALERT_CHANNEL } from './constants.js';

export interface AlertEventDto {
  id: string;
  ruleId: string;
  severity: string;
  message: string;
  createdAt: string;
  delivered: boolean;
}

export interface SeverityTotals {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
}

export function toAlertEventDto(row: AlertEventRow): AlertEventDto {
  return {
    id: row.id,
    ruleId: row.ruleId,
    severity: row.severity,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    delivered: row.deliveredAt !== null,
  };
}

export function resolveChannel(container: Container, preferred?: string | null): string {
  return preferred ?? container.config.slackDefaultChannel ?? DEFAULT_ALERT_CHANNEL;
}

export function formatAlertText(severity: string, message: string): string {
  const badge = severity === 'CRITICAL' ? ':rotating_light:' : severity === 'WARNING' ? ':warning:' : ':bulb:';
  return `${badge} [${severity}] ${message}`;
}

export function totalsBySeverity(rows: { severity: string; total: number }[]): SeverityTotals {
  const out: SeverityTotals = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const r of rows) {
    if (r.severity in out) out[r.severity as keyof SeverityTotals] = r.total;
  }
  return out;
}
