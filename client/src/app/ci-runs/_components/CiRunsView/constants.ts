import type { CiRunStatus } from "@devdigest/shared";

/** The most rows the page asks for (AC-46). */
export const RUNS_LIMIT = 200;

/** Status filter options, in table order. */
export const STATUS_FILTERS: readonly CiRunStatus[] = ["succeeded", "no_findings", "failed", "running"];

/** i18n key suffix per status (camelCase). */
export const STATUS_FILTER_KEY: Record<CiRunStatus, string> = {
  succeeded: "succeeded",
  no_findings: "noFindings",
  failed: "failed",
  running: "running",
};

/** `""` is "all" for every filter. */
export interface CiRunsFilters {
  repo: string;
  agentId: string;
  status: "" | CiRunStatus;
}

export const DEFAULT_FILTERS: CiRunsFilters = { repo: "", agentId: "", status: "" };

/** Refresh failure code → i18n key under `runs.stale.reasons`; anything else is `generic`. */
export const REFRESH_REASON_KEY: Record<string, string> = {
  github_permission: "githubPermission",
  github_token_missing: "githubTokenMissing",
  rate_limited: "rateLimited",
  refresh_timeout: "timeout",
  ci_refresh_running: "alreadyRunning",
};
export const GENERIC_REASON_KEY = "generic";
export const TIMEOUT_REASON_KEY = "timeout";
