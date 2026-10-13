import { ApiError } from "@/lib/api";
import type { CiExportInputBody, CiInstallation, CiPreviewFile } from "@devdigest/shared";
import {
  GITHUB_URL_PREFIX,
  REPO_FULL_NAME,
  TARGET,
  TRIGGERS,
  WORKFLOW_KIND,
  type InstallAction,
  type PostAs,
  type Trigger,
} from "./constants";

/** Flips `trigger` and keeps the canonical order, so the request (and the preview key) is stable. */
export function toggleTrigger(current: readonly Trigger[], trigger: Trigger): Trigger[] {
  const next = current.includes(trigger) ? current.filter((t) => t !== trigger) : [...current, trigger];
  return TRIGGERS.filter((t) => next.includes(t));
}

/** The request body for preview / export / archive. The workflow text is only sent for an edit (AC-20). */
export function buildInput(args: {
  repo: string;
  triggers: readonly Trigger[];
  postAs: PostAs;
  action?: InstallAction;
  workflowYaml?: string | null;
}): CiExportInputBody {
  return {
    repo: args.repo,
    target: TARGET,
    post_as: args.postAs,
    triggers: [...args.triggers],
    ...(args.action ? { action: args.action } : {}),
    ...(args.workflowYaml != null ? { workflow_yaml: args.workflowYaml } : {}),
  };
}

/** The installation of ANOTHER agent that already owns `repo` (AC-32). One per repo, case-insensitive. */
export function findTakenBy(
  installations: readonly CiInstallation[] | undefined,
  repo: string,
  agentId: string,
): CiInstallation | undefined {
  const wanted = repo.toLowerCase();
  return installations?.find((i) => i.repo.toLowerCase() === wanted && i.agent_id !== agentId);
}

/** Only an https://github.com/ URL is rendered as a link (the PR URL comes from the server). */
export function isGithubUrl(url: string | null | undefined): url is string {
  return !!url && url.startsWith(GITHUB_URL_PREFIX);
}

/** The repository's Actions secrets page (AC-11); null when `repo` is not a plain owner/name. */
export function secretsUrl(repo: string): string | null {
  return REPO_FULL_NAME.test(repo) ? `${GITHUB_URL_PREFIX}${repo}/settings/secrets/actions` : null;
}

/** The file Preview opens on: the workflow, else the first (AC-5). */
export function defaultFilePath(files: readonly CiPreviewFile[]): string | null {
  return (files.find((f) => f.kind === WORKFLOW_KIND) ?? files[0])?.path ?? null;
}

export type ExportErrorKind =
  | "github_token_missing"
  | "github_permission"
  | "runner_bundle_missing"
  | "ci_pr_failed"
  | "ci_no_changes"
  | "ci_export_running"
  | "ci_repo_taken"
  | "rate_limited"
  | "invalid_workflow"
  | "generic";

const KNOWN_CODES: readonly string[] = [
  "github_token_missing",
  "github_permission",
  "runner_bundle_missing",
  "ci_pr_failed",
  "ci_no_changes",
  "ci_export_running",
  "ci_repo_taken",
  "rate_limited",
];

/** Maps an export/preview failure to a message key by `ApiError.code` / `status`, never by message text. */
export function exportErrorKind(error: unknown): ExportErrorKind {
  if (!(error instanceof ApiError)) return "generic";
  if (error.code && KNOWN_CODES.includes(error.code)) return error.code as ExportErrorKind;
  if (error.status === 422) return "invalid_workflow";
  return "generic";
}

/** `details.agent_name` of a `ci_repo_taken` error, if present. */
export function takenAgentName(error: unknown): string | null {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== "object") return null;
  const name = (error.details as { agent_name?: unknown }).agent_name;
  return typeof name === "string" ? name : null;
}
