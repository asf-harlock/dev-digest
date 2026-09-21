import type { ConventionCategory, ConventionEvidence } from "@devdigest/shared";

/** Mirrors `ConfidenceNum`'s own threshold coloring (>=85 ok, >=65 warn, else muted). */
export function confidenceColor(confidence: number): string {
  const pct = Math.round(confidence * 100);
  return pct >= 85 ? "var(--ok)" : pct >= 65 ? "var(--warn)" : "var(--text-muted)";
}

export function evidenceLabel(evidence: ConventionEvidence): string {
  const range =
    evidence.start_line === evidence.end_line
      ? String(evidence.start_line)
      : `${evidence.start_line}-${evidence.end_line}`;
  return `${evidence.path}:${range}`;
}

export function formatCategoryLabel(category: ConventionCategory): string {
  return category.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
