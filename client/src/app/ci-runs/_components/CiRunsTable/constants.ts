import type { IconName } from "@devdigest/ui";
import type { CiFailureReason, CiRunStatus, Verdict } from "@devdigest/shared";

/** Icon + colour per verdict; the text label always comes with them (NFR-13). */
export const VERDICT_STYLE: Record<Verdict, { icon: IconName; color: string; bg: string }> = {
  approve: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  request_changes: { icon: "AlertTriangle", color: "var(--crit)", bg: "var(--crit-bg)" },
  comment: { icon: "MessageSquare", color: "var(--warn)", bg: "var(--warn-bg)" },
};

/** Status badge for a row without a verdict (running, or failed before any result). */
export const STATUS_STYLE: Record<CiRunStatus, { icon: IconName; color: string; bg: string }> = {
  succeeded: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  no_findings: { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)" },
  running: { icon: "RefreshCw", color: "var(--accent-text)", bg: "var(--accent-bg)" },
};

/** i18n key suffix (camelCase) per status / failure reason / verdict. */
export const STATUS_KEY: Record<CiRunStatus, string> = {
  succeeded: "succeeded",
  no_findings: "noFindings",
  failed: "failed",
  running: "running",
};

export const FAILURE_KEY: Record<CiFailureReason, string> = {
  artifact_rejected: "artifactRejected",
  no_artifact: "noArtifact",
  artifact_expired: "artifactExpired",
  cancelled: "cancelled",
  timed_out: "timedOut",
  stale: "stale",
};

export const VERDICT_KEY: Record<Verdict, string> = {
  approve: "approve",
  request_changes: "requestChanges",
  comment: "comment",
};

/** `owner/name` as GitHub allows it; anything else never becomes a link (UI-12). */
export const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/** Column widths (percent of the table), in render order. Sized so every header fits its column
 *  at the table's 900 px minimum (the card scrolls horizontally below that), and wide enough for
 *  "Security Reviewer" and the "Request changes" badge. */
export const COLUMN_WIDTHS = [13, 9, 17, 18, 9, 8, 9, 11, 6] as const;
