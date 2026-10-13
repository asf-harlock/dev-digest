import type { IconName } from "@devdigest/ui";
import type { CiInstallationStatus, CiRunStatus } from "@devdigest/shared";

/** A pill shows the latest run status, or the installation status while there is no run (EC-33). */
export type PillStatus = CiRunStatus | CiInstallationStatus;

/** Message key under `ciTab.status`, icon and colours per status — never colour alone (NFR-13). */
export const PILL: Record<PillStatus, { key: string; icon: IconName; color: string; bg: string }> = {
  succeeded: { key: "succeeded", icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  no_findings: { key: "noFindings", icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { key: "failed", icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)" },
  running: { key: "running", icon: "RefreshCw", color: "var(--info)", bg: "var(--info-bg)" },
  pending_pr: { key: "pendingPr", icon: "GitPullRequest", color: "var(--warn)", bg: "var(--warn-bg)" },
  manual: { key: "manual", icon: "File", color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  active: { key: "active", icon: "Check", color: "var(--ok)", bg: "var(--ok-bg)" },
};
