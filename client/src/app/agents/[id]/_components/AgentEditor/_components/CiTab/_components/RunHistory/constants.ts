import type { CiFailureReason } from "@devdigest/shared";

/** Message key under `ciTab.history.failureReason` per failure reason (EC-24, EC-27). */
export const FAILURE_REASON_KEY: Record<CiFailureReason, string> = {
  artifact_rejected: "artifactRejected",
  no_artifact: "noArtifact",
  artifact_expired: "artifactExpired",
  cancelled: "cancelled",
  timed_out: "timedOut",
  stale: "stale",
};

/** Shown for a missing value (EC-29). */
export const NO_VALUE = "—";
