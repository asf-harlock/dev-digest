import type { AgentColumn } from "@devdigest/shared";

/** The shown column: the selected one while it still exists, else the first. */
export function pickColumn(columns: AgentColumn[], selectedRunId: string | null): AgentColumn | null {
  return columns.find((c) => c.run_id === selectedRunId) ?? columns[0] ?? null;
}

/** Index of the tab an arrow / Home / End key moves to; null for any other key. */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** Score colour, the same thresholds as the kit's CircularScore (the number is always shown too). */
export function scoreColor(score: number): string {
  return score >= 75 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
}
