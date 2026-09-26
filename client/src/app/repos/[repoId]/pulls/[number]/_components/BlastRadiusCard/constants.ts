import type { IconName } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";

/** Chip appearance for the two downstream-impact kinds a symbol's callers
 *  can reach — endpoint (blue, globe) and cron/scheduled job (amber, clock) —
 *  matching the PR Brief mockup's chip colours. */
export const CHIP_META: Record<"endpoint" | "cron", { icon: IconName; color: string; bg: string }> = {
  endpoint: { icon: "Globe", color: "var(--accent-text)", bg: "var(--accent-bg)" },
  cron: { icon: "Clock", color: "var(--warn)", bg: "var(--warn-bg)" },
};

/** Degraded reasons a repo-intel resync can actually fix. `flag_off` means
 *  the feature itself is off (nothing to resync) and `repo_too_large` means
 *  the repo is intentionally excluded from indexing — neither gets the
 *  "Rebuild index" CTA; the other three all mean "the index needs rebuilding". */
export const RESYNCABLE_REASONS: readonly BlastDegradedReason[] = [
  "index_failed",
  "index_partial",
  "no_data",
];
