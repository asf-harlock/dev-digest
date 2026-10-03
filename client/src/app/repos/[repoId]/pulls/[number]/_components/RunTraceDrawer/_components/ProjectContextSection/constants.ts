import type { ProjectContextEntry } from "@devdigest/shared";

/** Badge colours per entry status; the badge always carries its text too. */
export const STATUS_COLORS: Record<ProjectContextEntry["status"], { color: string; bg: string }> = {
  attached: { color: "var(--ok)", bg: "var(--ok-bg)" },
  missing: { color: "var(--warn)", bg: "var(--bg-hover)" },
  too_large: { color: "var(--warn)", bg: "var(--bg-hover)" },
  unreadable: { color: "var(--crit)", bg: "var(--crit-bg)" },
  over_budget: { color: "var(--warn)", bg: "var(--bg-hover)" },
};
