import type { PrMeta } from "@devdigest/shared";
import { PR_TITLE_MAX_CHARS } from "./constants";

/** A PR can be reviewed only when it has an id and changed files (EC-8). */
export function hasChangedFiles(pr: Pick<PrMeta, "files_count">): boolean {
  return pr.files_count > 0;
}

/** Merged/closed PRs still run, with the "review is informational" warning (EC-9). */
export function isInformational(pr: Pick<PrMeta, "status">): boolean {
  return pr.status === "merged" || pr.status === "closed";
}

/** A PR title cut to PR_TITLE_MAX_CHARS with an ellipsis, so a long title cannot widen the selector. */
export function truncateTitle(title: string): string {
  return title.length > PR_TITLE_MAX_CHARS ? `${title.slice(0, PR_TITLE_MAX_CHARS - 1).trimEnd()}…` : title;
}
