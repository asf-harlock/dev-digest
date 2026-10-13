import type { AgentColumn } from "@devdigest/shared";
import { severityCounts, sortBySeverity } from "@/components/severity-counts";

/** The "N findings" figure: dismissed findings are listed but never counted (AC-23, EC-24). */
export function activeFindingCount(findings: AgentColumn["findings"]): number {
  return Object.values(severityCounts(findings)).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/** Findings CRITICAL → WARNING → SUGGESTION. */
export function sortedFindings(findings: AgentColumn["findings"]): AgentColumn["findings"] {
  return sortBySeverity(findings);
}

/** "file:line" for a finding (the start line, as the card list shows it). */
export function fileLine(f: Pick<AgentColumn["findings"][number], "file" | "start_line">): string {
  return `${f.file}:${f.start_line}`;
}
