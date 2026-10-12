import type { CSSProperties } from "react";

/** Co-located styles for OwnerPicker. */
export const s = {
  group: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 14px", margin: 0, padding: 0, border: "none", minWidth: 0, maxHeight: 60, overflowY: "auto" } satisfies CSSProperties,
  legend: { fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase", padding: 0, marginRight: 4, float: "left" } satisfies CSSProperties,
  item: { display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  option: (disabled: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 24,
    minWidth: 0,
    maxWidth: 260,
    fontSize: 13,
    color: disabled ? "var(--text-muted)" : "var(--text-primary)",
    cursor: disabled ? "not-allowed" : "pointer",
  }),
  name: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  kind: { fontSize: 11, color: "var(--text-secondary)", border: "1px solid var(--border-strong)", borderRadius: 4, padding: "0 5px", whiteSpace: "nowrap" } satisfies CSSProperties,
  inSet: { display: "inline-flex", alignItems: "center", gap: 4, minHeight: 24, fontSize: 12, fontWeight: 600, color: "var(--ok)", whiteSpace: "nowrap" } satisfies CSSProperties,
  none: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
