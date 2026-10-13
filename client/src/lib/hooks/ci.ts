/* hooks/ci.ts — React Query hooks for Export to CI and CI Runs (specs/11-export-to-ci.md).
   Reads are stored rows only (AC-63): `GET /ci/runs` and the installation lists never
   reach GitHub. The ONLY hook that makes the server call GitHub is `useRefreshCi`
   (`POST /ci/refresh`), started by the user (Refresh, force) or by `useAutoRefreshCi`
   (AC-53). Contracts are imported as TYPES only (see client/INSIGHTS.md). */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CiExport,
  CiExportInputBody,
  CiInstallation,
  CiPreview,
  CiPreviewFileContent,
  CiRefreshInputBody,
  CiRefreshResult,
  CiRun,
  CiRunsQueryInput,
} from "@devdigest/shared";
import { API_BASE, ApiError, api, apiFetch } from "../api";

/** A refresh request that has not answered after this long is abandoned (EC-31). */
export const CI_REFRESH_TIMEOUT_MS = 60_000;
/** An installation last refreshed longer ago than this is refreshed on open (AC-53). */
export const CI_AUTO_REFRESH_AFTER_MS = 60_000;

/** Query keys in one place so every invalidation below targets the same literals. */
export const ciKeys = {
  /** Prefix of every installation list (per-agent and workspace-wide). */
  installationsAll: ["ci-installations"] as const,
  agentInstallations: (agentId: string | null | undefined) => ["ci-installations", "agent", agentId] as const,
  workspaceInstallations: ["ci-installations", "workspace"] as const,
  /** Prefix of every CI runs list. */
  runsAll: ["ci-runs"] as const,
  runs: (filters: CiRunsQueryInput) => ["ci-runs", filters] as const,
  preview: (agentId: string | null | undefined, input: CiExportInputBody) =>
    ["ci-preview", agentId, input] as const,
  previewFile: (agentId: string | null | undefined, input: CiExportInputBody, path: string | null) =>
    ["ci-preview-file", agentId, input, path] as const,
};

/** AC-3, AC-5 — the file list for the Preview step. No GitHub call, no writes. */
export function useCiPreview(agentId: string | null | undefined, input: CiExportInputBody, enabled: boolean) {
  return useQuery<CiPreview, ApiError>({
    queryKey: ciKeys.preview(agentId, input),
    queryFn: () => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, input),
    enabled: enabled && !!agentId,
    // A 4xx (runner bundle missing, unsupported target) will not fix itself on a retry.
    retry: false,
  });
}

/** AC-6 — one runner file's contents, read only when the user selects it. */
export function useCiPreviewFile(
  agentId: string | null | undefined,
  input: CiExportInputBody,
  path: string | null,
  enabled: boolean,
) {
  return useQuery<CiPreviewFileContent, ApiError>({
    queryKey: ciKeys.previewFile(agentId, input, path),
    queryFn: () => {
      const params = new URLSearchParams({
        repo: input.repo,
        target: input.target ?? "gha",
        post_as: input.post_as ?? "github_review",
        triggers: (input.triggers ?? ["opened", "synchronize"]).join(","),
        path: path ?? "",
      });
      return api.get<CiPreviewFileContent>(`/agents/${agentId}/ci/preview/file?${params.toString()}`);
    },
    enabled: enabled && !!agentId && !!path,
    retry: false,
  });
}

/** AC-10..AC-15 — open the pull request (`action: "open_pr"`). Failures carry `ApiError.code`. */
export function useExportCi(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<CiExport, ApiError, CiExportInputBody>({
    mutationFn: (input) => api.post<CiExport>(`/agents/${agentId}/export-ci`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ciKeys.installationsAll });
    },
  });
}

/** `devdigest-ci-acme-payments-api.zip` from `Content-Disposition`, else a name built from the repo. */
export function archiveFilename(contentDisposition: string | null, repo: string): string {
  const match = contentDisposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  const fromHeader = match?.[1] ? decodeURIComponent(match[1]).trim() : "";
  if (fromHeader && !/[\\/]/.test(fromHeader)) return fromHeader;
  const name = repo.split("/").pop() || "repo";
  return `devdigest-ci-${name.replace(/[^\w.-]/g, "-")}.zip`;
}

async function toApiError(res: Response): Promise<ApiError> {
  let code: string | undefined;
  let message = `${res.status} ${res.statusText}`;
  let details: unknown;
  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(message, res.status, code, details);
}

/** AC-10 — the zip option. Returns the archive; the caller saves it (a blob download). */
export function useDownloadCiArchive(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<{ blob: Blob; filename: string }, ApiError, CiExportInputBody>({
    mutationFn: async (input) => {
      let res: Response;
      try {
        res = await fetch(`${API_BASE}/agents/${agentId}/export-ci/archive`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
      } catch (e) {
        throw new ApiError(`Cannot reach the DevDigest engine at ${API_BASE}. Is the API running?`, 0, "network_error", e);
      }
      if (!res.ok) throw await toApiError(res);
      return { blob: await res.blob(), filename: archiveFilename(res.headers.get("content-disposition"), input.repo) };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ciKeys.installationsAll });
    },
  });
}

/** AC-36..AC-44 — installations of one agent (the agent editor's CI tab). */
export function useAgentCiInstallations(agentId: string | null | undefined) {
  return useQuery<CiInstallation[], ApiError>({
    queryKey: ciKeys.agentInstallations(agentId),
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

/** AC-32 — every installation of the workspace (a repository holds one agent). */
export function useCiInstallations() {
  return useQuery<CiInstallation[], ApiError>({
    queryKey: ciKeys.workspaceInstallations,
    queryFn: () => api.get<CiInstallation[]>("/ci/installations"),
  });
}

/** AC-46, AC-50, AC-63 — stored CI runs, newest first. Empty/undefined filters are not sent. */
export function useCiRuns(filters: CiRunsQueryInput) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return useQuery<CiRun[], ApiError>({
    queryKey: ciKeys.runs(filters),
    queryFn: () => api.get<CiRun[]>(`/ci/runs${qs ? `?${qs}` : ""}`),
  });
}

/** AC-52 — fetch the newest workflow runs from GitHub. `force` skips the 30 s debounce.
 *  Abandoned after 60 s (EC-31). */
export function useRefreshCi() {
  const qc = useQueryClient();
  return useMutation<CiRefreshResult[], ApiError, CiRefreshInputBody>({
    mutationFn: (input) =>
      apiFetch<CiRefreshResult[]>("/ci/refresh", {
        method: "POST",
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(CI_REFRESH_TIMEOUT_MS),
      }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ciKeys.runsAll });
      qc.invalidateQueries({ queryKey: ciKeys.installationsAll });
    },
  });
}

/** Ids of the installations never refreshed or refreshed more than a minute ago (AC-53). */
export function staleInstallationIds(
  installations: readonly CiInstallation[] | undefined,
  now: number = Date.now(),
): string[] {
  return (installations ?? [])
    .filter((i) => {
      if (!i.last_refreshed_at) return true;
      const at = Date.parse(i.last_refreshed_at);
      return Number.isNaN(at) || now - at > CI_AUTO_REFRESH_AFTER_MS;
    })
    .map((i) => i.id);
}

export interface AutoRefreshState {
  /** A refresh started by this hook is in flight. */
  isRefreshing: boolean;
  /** The last auto refresh failed or timed out; the stored rows are still shown (EC-31). */
  isError: boolean;
}

/** AC-53 — on open, refresh each installation that is stale, once per installation per mount,
 *  one request at a time. Stops at the first failure so a GitHub outage raises one toast. */
export function useAutoRefreshCi(installations: readonly CiInstallation[] | undefined): AutoRefreshState {
  const { mutateAsync } = useRefreshCi();
  const attempted = React.useRef(new Set<string>());
  const [state, setState] = React.useState<AutoRefreshState>({ isRefreshing: false, isError: false });

  const staleKey = staleInstallationIds(installations).join(",");

  React.useEffect(() => {
    // Filter again here: the set changes between render and effect (and Strict Mode runs effects twice).
    const ids = staleKey.split(",").filter((id) => id && !attempted.current.has(id));
    if (ids.length === 0) return;
    ids.forEach((id) => attempted.current.add(id));
    // No cleanup flag on purpose: a refresh settling re-renders with fresher `last_refreshed_at`,
    // which changes `staleKey` and would otherwise cancel the very run that caused it.
    void (async () => {
      setState({ isRefreshing: true, isError: false });
      try {
        for (const id of ids) {
          await mutateAsync({ installation_id: id, force: false });
        }
        setState({ isRefreshing: false, isError: false });
      } catch {
        setState({ isRefreshing: false, isError: true });
      }
    })();
  }, [staleKey, mutateAsync]);

  return state;
}
