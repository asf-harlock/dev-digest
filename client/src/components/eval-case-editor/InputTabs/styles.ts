import type { CSSProperties } from "react";

/** Co-located styles for InputTabs. */
export const s = {
  wrap: (narrow: boolean): CSSProperties =>
    narrow
      ? { display: "flex", flexDirection: "column", gap: 6, minWidth: 0, height: 300 }
      : { display: "flex", flexDirection: "column", gap: 6, minWidth: 0, minHeight: 0, flex: "1 1 0", overflow: "hidden" },
  tablist: { display: "flex", alignItems: "center", gap: 2, borderBottom: "1px solid var(--border)", flex: "0 0 auto" } satisfies CSSProperties,
  tab: (on: boolean): CSSProperties => ({
    minHeight: 32,
    padding: "6px 12px",
    border: "none",
    borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`,
    marginBottom: -1,
    background: "transparent",
    color: on ? "var(--text-primary)" : "var(--text-secondary)",
    fontSize: 13,
    fontWeight: on ? 600 : 500,
    cursor: "pointer",
  }),
  panel: { display: "flex", flexDirection: "column", gap: 8, flex: "1 1 0", minHeight: 0, minWidth: 0 } satisfies CSSProperties,
  scrollPanel: { display: "flex", flexDirection: "column", gap: 12, flex: "1 1 0", minHeight: 0, minWidth: 0, overflow: "auto", padding: "2px 2px 2px 0" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  file: (marked: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    padding: "4px 8px",
    borderRadius: 6,
    border: `1px solid ${marked ? "var(--accent)" : "var(--border)"}`,
    fontSize: 12,
  }),
  path: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  mark: { fontSize: 11, fontWeight: 600, color: "var(--accent)", whiteSpace: "nowrap" } satisfies CSSProperties,
} as const;
