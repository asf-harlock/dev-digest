/* ci-format.ts — display helpers shared by the CI Runs page and the agent CI tab.
   Pure functions, no i18n and no React. */

import { EM_DASH } from "@/lib/eval-format";
import { formatRunCost } from "@/components/run-cost-badge";

const GITHUB_HOST = "https://github.com";

/** `—` for a missing cost (EC-29), `$0.00` for exactly zero (EC-37). */
export function formatCost(costUsd: number | null | undefined): string {
  return typeof costUsd === "number" && Number.isFinite(costUsd) ? formatRunCost(costUsd) : EM_DASH;
}

/** UI-11 — a job link only when GitHub's address points at THIS repository's workflow runs
 *  (https, host github.com, path `/<owner>/<repo>/actions/runs/…`). The value is reported by a
 *  third-party workflow, so it is never trusted on host alone. */
export function isTrustedJobUrl(url: string | null | undefined, repo: string): url is string {
  if (!url || !url.startsWith(`${GITHUB_HOST}/`)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "github.com") return false;
  return parsed.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/actions/runs/`);
}
