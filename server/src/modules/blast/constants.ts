/**
 * Constants for the blast module — the impact map for a PR: which symbols it
 * changes, who calls them, and which HTTP endpoints / cron jobs are reachable
 * from those callers.
 */

export const PULL_NOT_FOUND = 'Pull request not found';

/**
 * Singular/plural label pairs for `buildSummary`'s "N label(s)" segments,
 * joined with ` · ` in this fixed order:
 * `"2 changed symbols · 14 callers · 3 endpoints · 1 cron"`.
 */
export const SUMMARY_LABELS = {
  changedSymbols: ['changed symbol', 'changed symbols'],
  callers: ['caller', 'callers'],
  endpoints: ['endpoint', 'endpoints'],
  crons: ['cron', 'crons'],
} as const;
