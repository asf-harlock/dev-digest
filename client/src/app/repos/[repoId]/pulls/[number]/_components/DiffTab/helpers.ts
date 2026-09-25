/* DiffTab/helpers.ts — pure helpers for wiring Smart Diff findings into the
   Files changed tab (specs/lessons/L03). */
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";

/**
 * The same "latest review" definition the server uses for both the PR list
 * (`server/src/modules/pulls/routes.ts:118-144`) and Smart Diff
 * (`server/src/modules/reviews/service.ts`'s `smartDiffForPull`): `reviews`
 * arrives newest-first (`GET /pulls/:id/reviews`, the same repo query Smart
 * Diff's route reads) — keep only the first `kind==='review'` row per
 * `agent_id` (missing agent ids collapse into one 'none' bucket, same as the
 * server), then union every kept review's findings. `kind==='summary'` rows
 * and an agent's older re-runs are dropped, so a PR reviewed by several
 * agents shows the union of their CURRENT findings rather than just the
 * newest agent's.
 */
export function latestFindingsPerAgent(reviews: ReviewRecord[]): FindingRecord[] {
  const seenAgents = new Set<string>();
  const findings: FindingRecord[] = [];
  for (const review of reviews) {
    if (review.kind !== "review") continue;
    const agentKey = review.agent_id ?? "none";
    if (seenAgents.has(agentKey)) continue;
    seenAgents.add(agentKey);
    findings.push(...review.findings);
  }
  return findings;
}

/** Index findings by file path for `DiffFindingsApi.byPath` — one map lookup
 *  per FileCard instead of filtering the full list per file. */
export function groupFindingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const byPath = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = byPath.get(f.file) ?? [];
    list.push(f);
    byPath.set(f.file, list);
  }
  return byPath;
}
