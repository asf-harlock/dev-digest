import type { CiInstallation, CiRefreshResult, CiRunsQueryInput } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { GENERIC_REASON_KEY, REFRESH_REASON_KEY, RUNS_LIMIT, TIMEOUT_REASON_KEY, type CiRunsFilters } from "./constants";

/** Filters → `GET /ci/runs` query; an empty filter is left out. */
export function toRunsQuery(f: CiRunsFilters): CiRunsQueryInput {
  return {
    limit: RUNS_LIMIT,
    ...(f.repo ? { repo: f.repo } : {}),
    ...(f.agentId ? { agent_id: f.agentId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
}

export function hasActiveFilter(f: CiRunsFilters): boolean {
  return f.repo !== "" || f.agentId !== "" || f.status !== "";
}

/** Repository names of the workspace's installations, sorted, one each (case-insensitive). */
export function repoOptions(installations: readonly CiInstallation[] | undefined): string[] {
  const seen = new Map<string, string>();
  for (const i of installations ?? []) if (!seen.has(i.repo.toLowerCase())) seen.set(i.repo.toLowerCase(), i.repo);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Agents that have an installation, one each, by name. */
export function agentOptions(installations: readonly CiInstallation[] | undefined): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const i of installations ?? []) if (!seen.has(i.agent_id)) seen.set(i.agent_id, i.agent_name);
  return [...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** i18n key (under `runs.stale.reasons`) for why the last refresh did not complete, or null when it did.
 *  A request error wins; otherwise the first per-installation failure. */
export function refreshFailureKey(
  error: unknown,
  results: readonly CiRefreshResult[] | undefined,
): string | null {
  if (error) {
    if (error instanceof ApiError) {
      const aborted = (error.details as { name?: string } | undefined)?.name;
      if (aborted === "TimeoutError" || aborted === "AbortError") return TIMEOUT_REASON_KEY;
      return (error.code && REFRESH_REASON_KEY[error.code]) || GENERIC_REASON_KEY;
    }
    return GENERIC_REASON_KEY;
  }
  const failed = results?.find((r) => r.status === "failed");
  if (!failed) return null;
  return (failed.failure?.code && REFRESH_REASON_KEY[failed.failure.code]) || GENERIC_REASON_KEY;
}
