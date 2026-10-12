import type { CSSProperties } from "react";
import type { DeltaDirection } from "@/lib/eval-format";

/** Co-located styles for EvalKpiCards. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  grid: { display: "flex", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  tile: { flex: "1 1 200px", minWidth: 180, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  meta: { display: "flex", flexDirection: "column", gap: 2, padding: "8px 4px 0" } satisfies CSSProperties,
  delta: (direction: DeltaDirection): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    color:
      direction === "up" ? "var(--ok)" : direction === "down" ? "var(--crit)" : "var(--text-secondary)",
  }),
  scoring: { margin: 0, fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
