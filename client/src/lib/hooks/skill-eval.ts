/* hooks/skill-eval.ts — React Query hooks for the skill side of the Eval Pipeline
   (specs/09-skill-evals.md): the skill's case set, finding → skill case, and the skill
   eval run (overview, start, follow by polling).
   Case writes (create by hand / edit / delete) share `hooks/eval.ts`; this file holds
   what only skills have. Contracts are imported as TYPES only (client/INSIGHTS.md). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EvalCase,
  EvalCaseInput,
  EvalFindingSkills,
  EvalRunDetail,
  EvalRunStart,
  EvalSkillCaseListItem,
  EvalSkillOverview,
  EvalSkillRunDetail,
  SkillEvalCaseRequest,
  SkillEvalRunRequest,
} from "@devdigest/shared";
import { api, ApiError } from "../api";
import { caseSaveRejection, detailsId, evalKeys, saveEvalCase, type CaseSaveRejection, type SaveEvalCaseResult } from "./eval";
import { useRunPolling, type RunPollingCallbacks } from "./eval-run-polling";

/** `GET /skills/:id/eval-cases` — newest first; `latest_result` is null until a skill run exists. */
export function useSkillEvalCases(skillId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.skillCases(skillId),
    queryFn: () => api.get<EvalSkillCaseListItem[]>(`/skills/${skillId}/eval-cases`),
    enabled: !!skillId,
  });
}

/** `POST /skills/:id/eval-cases` → 201. `mutate(input)`; 422s and 413 resolve as `rejected`. */
export function useCreateSkillEvalCase(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput): Promise<SaveEvalCaseResult> =>
      saveEvalCase(() => api.post<EvalCase>(`/skills/${skillId}/eval-cases`, input)),
    onSuccess: (result) => {
      if (result.kind !== "saved") return;
      qc.invalidateQueries({ queryKey: evalKeys.skillCases(skillId) });
    },
  });
}

/**
 * `GET /findings/:id/eval-skills` — the skills recorded for the finding's review run,
 * with whether each already has a case. Pass `enabled: false` until the card is open
 * (AC-48): nothing is fetched for a collapsed card.
 */
export function useFindingSkills(findingId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: evalKeys.findingSkills(findingId),
    queryFn: () => api.get<EvalFindingSkills>(`/findings/${findingId}/eval-skills`),
    enabled: enabled && !!findingId,
  });
}

/** 422 codes the Case Editor renders inline for a skill owner (SPEC-09 EC-35, EC-37, EC-44;
 *  SPEC-10 adds the editor's own: `validation_error`, `frozen_diff_too_large`). */
export type SkillCaseRejection =
  | "finding_undecided"
  | "skill_not_in_run"
  | "no_patch"
  | "range_outside_diff"
  | CaseSaveRejection;

const SKILL_CASE_REJECTIONS: readonly string[] = [
  "finding_undecided",
  "skill_not_in_run",
  "no_patch",
  "range_outside_diff",
];

export type CreateSkillCaseResult =
  /** 201 — the case was created. */
  | { kind: "created"; caseId: string; skillId: string }
  /** 200 — the skill already had a case made from this finding (second tab, earlier
   *  session). Treated like the agent route's 409 (SPEC-10 EC-5): no second case. */
  | { kind: "exists"; caseId: string; skillId: string }
  | { kind: "rejected"; code: SkillCaseRejection };

/** What `useCreateSkillCaseFromFinding` takes: a skill id (the server freezes the finding,
 *  SPEC-09) or the id plus the edited case of the Case Editor (SPEC-10 AC-6). */
export type SkillCaseRequest = string | { skillId: string; input?: EvalCaseInput };

/**
 * `POST /findings/:id/skill-eval-case` with `{ skill_id, input? }`.
 * `mutate(skillId)` or `mutate({ skillId, input })`.
 *
 * Resolves for the 201/200 and the 422 codes so the Case Editor explains them itself;
 * anything else (network, 5xx, 404) throws and is toasted once by the global handler.
 * On success the skill's entry in the finding's skill list flips to "has a case" without a
 * reload, and the finding card's state refreshes (AC-9).
 */
export function useCreateSkillCaseFromFinding(findingId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (request: SkillCaseRequest): Promise<CreateSkillCaseResult> => {
      const { skillId, input } = typeof request === "string" ? { skillId: request, input: undefined } : request;
      const body: SkillEvalCaseRequest = input ? { skill_id: skillId, input } : { skill_id: skillId };
      try {
        const { status, data } = await api.postWithStatus<EvalCase>(
          `/findings/${findingId}/skill-eval-case`,
          body,
        );
        return { kind: status === 200 ? "exists" : "created", caseId: data.id, skillId };
      } catch (err) {
        if (err instanceof ApiError && err.status === 422 && err.code && SKILL_CASE_REJECTIONS.includes(err.code)) {
          return { kind: "rejected", code: err.code as SkillCaseRejection };
        }
        const code = caseSaveRejection(err);
        if (code) return { kind: "rejected", code };
        throw err;
      }
    },
    onSuccess: (result) => {
      if (result.kind === "rejected") return;
      qc.setQueryData<EvalFindingSkills>(evalKeys.findingSkills(findingId), (old) =>
        old
          ? {
              skills: old.skills.map((sk) =>
                sk.skill_id === result.skillId ? { ...sk, has_case: true, case_id: result.caseId } : sk,
              ),
            }
          : old,
      );
      qc.invalidateQueries({ queryKey: evalKeys.findingSkills(findingId) });
      qc.invalidateQueries({ queryKey: evalKeys.skillCases(result.skillId) });
      qc.invalidateQueries({ queryKey: evalKeys.skillOverview(result.skillId) });
    },
  });
}

// ---------------------------------------------------------------------------
// Skill eval run (SPEC-09 Phase B)
// ---------------------------------------------------------------------------

/**
 * `GET /skills/:id/eval-overview` — the case count, the linked agents that can carry a
 * run (`carriers`), the running run's id, the latest and previous finished runs and the
 * trend. Not polled: the run itself is followed with `useSkillEvalRun`, which refreshes
 * this when the run finishes (AC-34).
 */
export function useSkillEvalOverview(skillId: string | null | undefined) {
  return useQuery({
    queryKey: evalKeys.skillOverview(skillId),
    queryFn: () => api.get<EvalSkillOverview>(`/skills/${skillId}/eval-overview`),
    enabled: !!skillId,
  });
}

/**
 * `POST /skills/:id/eval-runs` with `{ carrier_agent_id }` → 202 `{id, status: "running"}`.
 * `mutate(carrierAgentId)`.
 *
 * A 409 `eval_run_in_progress` (double click, second tab — EC-14) resolves with the
 * already-running run's id from `details.run_id`, so the caller just follows that run;
 * if the server omitted it the error is rethrown. Every other failure (422
 * `no_agent_linked` / `no_eval_cases`, network, 5xx) throws and is toasted once by the
 * global handler. Like `useStartEvalRun`, `isPending` only covers the request: follow
 * the run with `useSkillEvalRun`, never with `isPending`.
 */
export function useStartSkillEvalRun(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (carrierAgentId: string): Promise<EvalRunStart> => {
      const body: SkillEvalRunRequest = { carrier_agent_id: carrierAgentId };
      try {
        return await api.post<EvalRunStart>(`/skills/${skillId}/eval-runs`, body);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409 && err.code === "eval_run_in_progress") {
          const id = detailsId(err.details, ["run_id", "runId", "id"]);
          if (id) return { id, status: "running" };
        }
        throw err;
      }
    },
    // A rejected start (carrier unlinked, cases deleted elsewhere) means the overview is stale.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: evalKeys.skillOverview(skillId) });
    },
  });
}

/** Re-read a running skill run this often… */
export const SKILL_EVAL_RUN_POLL_MS = 2000;
/** …and stop after this long (EC-19). A skill run reviews every case twice. */
export const SKILL_EVAL_RUN_TIMEOUT_MS = 20 * 60 * 1000;

/** A single-case skill run reviews the case twice: the client gives up after 6 minutes (SPEC-10 EC-23). */
export const SKILL_EVAL_CASE_RUN_TIMEOUT_MS = 6 * 60 * 1000;

export type SkillEvalRunCallbacks = RunPollingCallbacks<EvalSkillRunDetail>;

/**
 * Follows one skill run until it finishes (`GET /eval-runs/:id`, the `owner_kind: "skill"`
 * shape). Pass the id from `useStartSkillEvalRun` or `overview.running_run_id`;
 * `null`/`undefined` idles.
 *
 * - Polls every SKILL_EVAL_RUN_POLL_MS while `running`, stops by itself on any other
 *   status (AC-34).
 * - Still running after SKILL_EVAL_RUN_TIMEOUT_MS → `timedOut`, polling stops (EC-19).
 * - A failed poll → `pollFailed`, polling stops, no extra toast; `retry()` resumes with a
 *   fresh timeout window (EC-20).
 * - On finish the skill's overview (passing count, lift, trend) and case list are
 *   invalidated and `onFinished` fires once (AC-34).
 */
export function useSkillEvalRun(
  runId: string | null | undefined,
  callbacks: SkillEvalRunCallbacks = {},
  options: { timeoutMs?: number } = {},
) {
  return useRunPolling<EvalSkillRunDetail>({
    runId,
    queryKey: evalKeys.skillRun(runId),
    fetchRun: async (id) => {
      const run = await api.get<EvalRunDetail>(`/eval-runs/${id}`);
      // A run id that belongs to an agent is a caller bug, not a state to render.
      if (run.owner_kind !== "skill") throw new Error(`eval run ${id} is not a skill run`);
      return run;
    },
    pollMs: SKILL_EVAL_RUN_POLL_MS,
    timeoutMs: options.timeoutMs ?? SKILL_EVAL_RUN_TIMEOUT_MS,
    onSettled: (run, qc) => {
      qc.invalidateQueries({ queryKey: evalKeys.skillOverview(run.skill_id) });
      qc.invalidateQueries({ queryKey: evalKeys.skillCases(run.skill_id) });
      // A run (of one case or of the set) changes each case's latest result (AC-42).
      qc.invalidateQueries({ queryKey: evalKeys.caseAll });
    },
    callbacks,
  });
}
