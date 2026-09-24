import type { FindingRow, ReviewRow } from '../../../db/rows.js';

/**
 * Same dedup key as `pulls/routes.ts`'s `seenPrAgent`: `rows` are newest-first
 * (as `reviewsForPull` returns them), so the first row per agent
 * (`agentId ?? 'none'`) is that agent's latest review — union its findings
 * with every other agent's. `kind==='summary'` rows and repeated agent runs
 * are ignored, same as the PR-list route.
 */
export function latestFindingsPerAgent(rows: { review: ReviewRow; findings: FindingRow[] }[]): FindingRow[] {
  const seenAgents = new Set<string>();
  const findings: FindingRow[] = [];
  for (const { review, findings: reviewFindings } of rows) {
    if (review.kind !== 'review') continue;
    const agentKey = review.agentId ?? 'none';
    if (seenAgents.has(agentKey)) continue;
    seenAgents.add(agentKey);
    findings.push(...reviewFindings);
  }
  return findings;
}
