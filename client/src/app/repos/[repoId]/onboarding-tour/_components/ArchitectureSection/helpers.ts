import type { TourArchitecture } from "@devdigest/shared";

/** Escape a label for a quoted mermaid string: entity codes for the characters
 *  that could close the quote or inject markup; newlines collapse to spaces. */
export function escapeLabel(label: string): string {
  return label
    .replace(/\s+/g, " ")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/[`\\]/g, "")
    .trim();
}

/**
 * Mermaid `flowchart` source from the section's grounded nodes and edges
 * (UI-6). Node ids are synthetic (`n0`, `n1`, …) so model ids never reach the
 * syntax; labels are quoted and escaped. Returns null when no edge connects
 * two known nodes (AC-5: no diagram without at least one grounded edge).
 */
export function buildDiagramSource(section: Pick<TourArchitecture, "nodes" | "edges">): string | null {
  const index = new Map<string, number>();
  section.nodes.forEach((n, i) => {
    if (!index.has(n.id)) index.set(n.id, i);
  });
  const seen = new Set<string>();
  const edges: string[] = [];
  for (const e of section.edges) {
    const a = index.get(e.from);
    const b = index.get(e.to);
    if (a === undefined || b === undefined) continue;
    const line = `n${a} --> n${b}`;
    if (seen.has(line)) continue;
    seen.add(line);
    edges.push(`  ${line}`);
  }
  if (edges.length === 0) return null;
  const nodes = section.nodes.map((n, i) => `  n${i}["${escapeLabel(n.label) || "?"}"]`);
  return ["flowchart LR", ...nodes, ...edges].join("\n");
}
