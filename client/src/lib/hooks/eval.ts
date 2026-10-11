/* hooks/eval.ts — React Query hooks for the Eval Pipeline (specs/08-eval-pipeline.md).
   Cases come from triaged findings (POST /findings/:id/eval-case); a run is a
   background job on the server, so — like hooks/intent.ts — `POST …/eval-runs`
   only confirms the start and `useEvalRun` polls `GET /eval-runs/:id` until the
   status leaves `running`. Contracts are imported as TYPES only: a runtime
   import from `@devdigest/shared` breaks `next build` (client/INSIGHTS.md).
   SPEC-09 adds the Case Editor writes here (create by hand, edit/replace) for both
   owners; the skill-only reads live in hooks/skill-eval.ts. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EvalCase,
  EvalCaseDetail,
  EvalCaseInput,
  EvalCaseLinks,
  EvalCaseListItem,
  EvalCaseUpdate,
  EvalCompare,
  EvalDashboard,
  EvalOverview,
  EvalAgentRunDetail,
  EvalRunStart,
} from "@devdigest/shared";
import { api, ApiError } from "../api";
import { useRunPolling, type RunPollingCallbacks } from "./eval-run-polling";

// ---------------------------------------------------------------------------
// Query keys — one place, so the invalidations below cannot drift apart.
// ---------------------------------------------------------------------------

export const evalKeys = {
  /** Prefix of every case-list query (all agents). */
  casesAll: ["eval-cases"] as const,
  cases: (agentId: string | null | undefined) => ["eval-cases", agentId] as const,
  case: (caseId: string | null | undefined) => ["eval-case", caseId] as const,
  /** Prefix of every skill case-list query (SPEC-09). */
  skillCasesAll: ["skill-eval-cases"] as const,
  skillCases: (skillId: string | null | undefined) => ["skill-eval-cases", skillId] as const,
  skillOverview: (skillId: string | null | undefined) => ["skill-eval-overview", skillId] as const,
  /** A skill run's detail; kept apart from `run` so the two detail shapes never share a cache entry. */
  skillRun: (runId: string | null | undefined) => ["skill-eval-run", runId] as const,
  /** Prefix of every finding → skills query (SPEC-09). */
  findingSkillsAll: ["eval-finding-skills"] as const,
  findingSkills: (findingId: string | null | undefined) => ["eval-finding-skills", findingId] as const,
  /** Prefix of every PR's finding → case links query. */
  linksAll: ["eval-case-links"] as const,
  overview: (agentId: string | null | undefined) => ["eval-overview", agentId] as const,
  run: (runId: string | null | undefined) => ["eval-run", runId] as const,
  dashboard: ["eval-dashboard"] as const,
  compare: (a: string | null | undefined, b: string | null | undefined) =>
    ["eval-compare", a, b] as const,
  links: (pullId: string | null | undefined) => ["eval-case-links", pullId] as const,
};

/** A 4xx is an answer, not a blip — don't retry it (the default retries once). */
function retryUnlessClientError(failureCount: number, err: unknown): boolean {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) return false;
  return failureCount < 1;
}

/** Reads a string id out of an `ApiError.details` object, trying the given keys. */
export function detailsId(details: unknown, keys: readonly string[]): string | null {
  if (!details || typeof details !== "object") return null;
  const bag = details as Record<string, unknown>;
  for (const key of keys) {
    const v = bag[key];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Case set
// ---------------------------------------------------------------------------

/** `GET /agents/:id/eval-cases` — newest first, each with its latest result. */
export function useAgentEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.cases(agentId),
    queryFn: () => api.get<EvalCaseListItem[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** `GET /eval-cases/:id` — frozen input + `source` (null once the PR is gone). */
export function useEvalCase(caseId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.case(caseId),
    queryFn: () => api.get<EvalCaseDetail>(`/eval-cases/${caseId}`),
    enabled: !!caseId,
    retry: retryUnlessClientError,
  });
}

// ---------------------------------------------------------------------------
// Case Editor writes (SPEC-09): create by hand, edit, replace
// ---------------------------------------------------------------------------

/** 422 codes (and the 413 of an oversize body) the Case Editor renders inline. */
export type CaseSaveRejection =
  | "frozen_diff_too_large"
  | "no_patch"
  | "range_outside_diff"
  | "validation_error"
  | "case_input_locked";

const CASE_SAVE_REJECTIONS: readonly string[] = [
  "frozen_diff_too_large",
  "no_patch",
  "range_outside_diff",
  "validation_error",
  "case_input_locked",
];

/** Maps an `ApiError` to the inline outcome it stands for, or null when it is not
 *  one (network, 5xx, 404 → rethrown and toasted once by the global handler).
 *  A 413 (body over the server's limit) is the same message as an oversize diff (EC-42). */
export function caseSaveRejection(err: unknown): CaseSaveRejection | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status === 413) return "frozen_diff_too_large";
  if (err.status === 422 && err.code && CASE_SAVE_REJECTIONS.includes(err.code)) {
    return err.code as CaseSaveRejection;
  }
  return null;
}

export type SaveEvalCaseResult =
  /** 201 / 200 — `case.replaced_from_id` is set when an edit replaced the case. */
  | { kind: "saved"; case: EvalCase }
  /** A rejection the editor shows inline; the draft stays untouched. */
  | { kind: "rejected"; code: CaseSaveRejection };

/** Runs a write and resolves (never throws) for the inline rejections. */
export async function saveEvalCase(write: () => Promise<EvalCase>): Promise<SaveEvalCaseResult> {
  try {
    return { kind: "saved", case: await write() };
  } catch (err) {
    const code = caseSaveRejection(err);
    if (code) return { kind: "rejected", code };
    throw err;
  }
}

/** Every cache a created, edited, replaced or deleted case can change. */
function invalidateCaseViews(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: evalKeys.casesAll });
  qc.invalidateQueries({ queryKey: evalKeys.skillCasesAll });
  qc.invalidateQueries({ queryKey: ["eval-overview"] });
  qc.invalidateQueries({ queryKey: evalKeys.dashboard });
}

/** `POST /agents/:id/eval-cases` → 201. `mutate(input)`; 422s and 413 resolve as `rejected`. */
export function useCreateAgentEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput): Promise<SaveEvalCaseResult> =>
      saveEvalCase(() => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, input)),
    onSuccess: (result) => {
      if (result.kind === "saved") invalidateCaseViews(qc);
    },
  });
}

/**
 * `PATCH /eval-cases/:id` — an `EvalCaseUpdate` (the agent tab's `{ name }` rename is
 * one). The reply is the resulting case; `replaced_from_id` names the case it replaced
 * (AC-47), whose caches are dropped so the list shows the new case in its place (AC-16).
 */
export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      caseId,
      update,
    }: {
      caseId: string;
      update: EvalCaseUpdate;
    }): Promise<SaveEvalCaseResult> =>
      saveEvalCase(() => api.patch<EvalCase>(`/eval-cases/${caseId}`, update)),
    onSuccess: (result, { caseId }) => {
      if (result.kind !== "saved") return;
      const replaced = result.case.replaced_from_id;
      if (replaced) qc.removeQueries({ queryKey: evalKeys.case(replaced) });
      qc.invalidateQueries({ queryKey: evalKeys.case(caseId) });
      qc.invalidateQueries({ queryKey: evalKeys.linksAll });
      qc.invalidateQueries({ queryKey: evalKeys.findingSkillsAll });
      invalidateCaseViews(qc);
    },
  });
}

/** `DELETE /eval-cases/:id` → 204 (agent or skill case). Past runs keep their results (AC-18). */
export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId }: { caseId: string }) => api.del<void>(`/eval-cases/${caseId}`),
    onSuccess: (_data, { caseId }) => {
      qc.removeQueries({ queryKey: evalKeys.case(caseId) });
      // A deleted case frees its finding: the card's "In eval set" must flip back.
      qc.invalidateQueries({ queryKey: evalKeys.linksAll });
      qc.invalidateQueries({ queryKey: evalKeys.findingSkillsAll });
      invalidateCaseViews(qc);
    },
  });
}

// ---------------------------------------------------------------------------
// Turn a finding into a case
// ---------------------------------------------------------------------------

/** Codes of the 422s the PR page renders inline (EC-1, EC-2, EC-4, EC-5). */
export type EvalCaseRejection =
  | "finding_undecided"
  | "agent_missing"
  | "no_patch"
  | "range_outside_diff";

const CASE_REJECTIONS: readonly string[] = [
  "finding_undecided",
  "agent_missing",
  "no_patch",
  "range_outside_diff",
];

export type CreateEvalCaseResult =
  /** 201 — the case was created. */
  | { kind: "created"; caseId: string; agentId: string }
  /** 409 `eval_case_exists` — already in the set; shown as "In eval set" (EC-3).
   *  `caseId` comes from the error `details` and is null if the server omitted it. */
  | { kind: "exists"; caseId: string | null }
  /** A 422 the UI explains inline with a prReview.json string. */
  | { kind: "rejected"; code: EvalCaseRejection };

/**
 * `POST /findings/:id/eval-case`, no body. `mutate(findingId)`.
 *
 * The mutation RESOLVES (does not throw) for the outcomes the UI handles itself —
 * 201, 409 `eval_case_exists`, and the four 422 codes — so the global
 * MutationCache does not also raise a generic toast for them. Anything else
 * (network, 5xx, 404) still throws and is toasted once by the global handler.
 *
 * @param pullId the PR the finding belongs to — its case-links query is refreshed.
 */
export function useCreateEvalCaseFromFinding(pullId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (findingId: string): Promise<CreateEvalCaseResult> => {
      try {
        const created = await api.post<EvalCase>(`/findings/${findingId}/eval-case`);
        return { kind: "created", caseId: created.id, agentId: created.owner_id };
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 409 && err.code === "eval_case_exists") {
            return { kind: "exists", caseId: detailsId(err.details, ["case_id", "caseId", "id"]) };
          }
          if (err.status === 422 && err.code && CASE_REJECTIONS.includes(err.code)) {
            return { kind: "rejected", code: err.code as EvalCaseRejection };
          }
        }
        throw err;
      }
    },
    onSuccess: (result, findingId) => {
      if (result.kind === "rejected") return;
      if (result.kind === "created") {
        // Flip the card to "In eval set" without waiting for the refetch.
        qc.setQueryData<EvalCaseLinks>(evalKeys.links(pullId), (old) => ({
          links: [
            ...(old?.links ?? []).filter((l) => l.finding_id !== findingId),
            { finding_id: findingId, case_id: result.caseId, agent_id: result.agentId },
          ],
        }));
      }
      qc.invalidateQueries({ queryKey: evalKeys.links(pullId) });
      qc.invalidateQueries({ queryKey: evalKeys.casesAll });
      qc.invalidateQueries({ queryKey: ["eval-overview"] });
    },
  });
}

/** `GET /pulls/:id/eval-case-links` — which findings of the PR already have a case. */
export function usePullEvalCaseLinks(pullId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.links(pullId),
    queryFn: () => api.get<EvalCaseLinks>(`/pulls/${pullId}/eval-case-links`),
    enabled: !!pullId,
  });
}

// ---------------------------------------------------------------------------
// Overview, dashboard, compare
// ---------------------------------------------------------------------------

/** `GET /agents/:id/eval-overview` — KPIs, trend, run history, `running_run_id`. */
export function useAgentEvalOverview(agentId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.overview(agentId),
    queryFn: () => api.get<EvalOverview>(`/agents/${agentId}/eval-overview`),
    enabled: !!agentId,
  });
}

/** `GET /eval-dashboard` — every agent's latest metrics + the last 20 runs. */
export function useEvalDashboard() {
  return useQuery({
    queryKey: evalKeys.dashboard,
    queryFn: () => api.get<EvalDashboard>("/eval-dashboard"),
  });
}

/**
 * `GET /eval-runs/compare?a&b`. Disabled until both ids are set. A 422
 * `run_not_finished` / `runs_not_comparable` or a 404 surfaces as `error`
 * (an `ApiError` — branch on `status` / `code`); 4xx is not retried.
 */
export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.compare(a, b),
    queryFn: () =>
      api.get<EvalCompare>(
        `/eval-runs/compare?a=${encodeURIComponent(a ?? "")}&b=${encodeURIComponent(b ?? "")}`,
      ),
    enabled: !!a && !!b,
    retry: retryUnlessClientError,
  });
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

/**
 * `POST /agents/:id/eval-runs` → 202 `{id, status: "running"}`. `mutate()`.
 *
 * A 409 `eval_run_in_progress` (double click, second tab — EC-10/EC-37) resolves
 * with the already-running run's id from the error `details`, so the caller just
 * follows that run. If the server omitted the id the error is rethrown. Like
 * `useClassifyIntent`, `isPending` only covers the request: track the run with
 * `useEvalRun` (or `overview.running_run_id`), not with `isPending`.
 */
export function useStartEvalRun(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<EvalRunStart> => {
      try {
        return await api.post<EvalRunStart>(`/agents/${agentId}/eval-runs`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && err.code === "eval_run_in_progress") {
          const id = detailsId(err.details, ["run_id", "runId", "id"]);
          if (id) return { id, status: "running" };
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: evalKeys.overview(agentId) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard });
    },
  });
}

/** `GET /eval-runs/:id` once, no polling — for opening an already finished run
 *  (run-detail modal). Use `useEvalRun` to follow a run that is executing. */
export function useEvalRunDetail(runId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.run(runId),
    queryFn: () => api.get<EvalAgentRunDetail>(`/eval-runs/${runId}`),
    enabled: !!runId,
    retry: retryUnlessClientError,
  });
}

/** Re-read the run this often while it is `running`… */
export const EVAL_RUN_POLL_MS = 2000;
/** …and stop after this long (EC-15): the server only ever finishes or reaps a run
 *  on its next boot, so a timeout is the honest end of the client's wait. */
export const EVAL_RUN_TIMEOUT_MS = 10 * 60 * 1000;

export type EvalRunCallbacks = RunPollingCallbacks<EvalAgentRunDetail>;

/**
 * Follows one eval run until it finishes. Pass the id from `useStartEvalRun`
 * or `overview.running_run_id`; `null`/`undefined` idles.
 *
 * - Polls `GET /eval-runs/:id` every EVAL_RUN_POLL_MS while `status === "running"`
 *   and stops by itself the moment it is anything else (AC-26). The mutation's
 *   `isPending` is never used as the loading state.
 * - After EVAL_RUN_TIMEOUT_MS still running → `timedOut` (EC-15), polling stops.
 * - A failed poll → `pollFailed`, polling stops, no extra toast; `retry()` resumes
 *   with a fresh timeout window (EC-16).
 * - On finish, the agent's overview, case list and the dashboard are invalidated
 *   (AC-26) and `onFinished` fires once.
 *
 * The loop itself lives in `eval-run-polling.ts` (shared with `useSkillEvalRun`).
 */
export function useEvalRun(
  runId: string | null | undefined,
  callbacks: EvalRunCallbacks = {},
) {
  return useRunPolling<EvalAgentRunDetail>({
    runId,
    queryKey: evalKeys.run(runId),
    fetchRun: (id) => api.get<EvalAgentRunDetail>(`/eval-runs/${id}`),
    pollMs: EVAL_RUN_POLL_MS,
    timeoutMs: EVAL_RUN_TIMEOUT_MS,
    onSettled: (run, qc) => {
      qc.invalidateQueries({ queryKey: evalKeys.overview(run.agent_id) });
      qc.invalidateQueries({ queryKey: evalKeys.cases(run.agent_id) });
      qc.invalidateQueries({ queryKey: evalKeys.dashboard });
    },
    callbacks,
  });
}
