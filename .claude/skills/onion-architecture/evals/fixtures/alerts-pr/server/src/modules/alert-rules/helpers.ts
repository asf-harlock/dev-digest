import type { AlertRuleRow } from './repository.js';
import { RESERVED_RULE_NAMES } from './constants.js';

export interface AlertRuleDto {
  id: string;
  name: string;
  severity: string;
  createdAt: string;
}

export function toAlertRuleDto(row: AlertRuleRow): AlertRuleDto {
  return {
    id: row.id,
    name: row.name,
    severity: row.severity,
    createdAt: row.createdAt.toISOString(),
  };
}

export function isReservedName(name: string): boolean {
  return (RESERVED_RULE_NAMES as readonly string[]).includes(name.trim().toLowerCase());
}

export function normalizeRuleName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
