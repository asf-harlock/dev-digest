import type { CSSProperties } from "react";

export const s = {
  list: {
    display: "flex",
    gap: 2,
    overflowX: "auto",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  tab: (on: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "11px 16px",
    border: "none",
    background: "transparent",
    borderBottom: "2px solid " + (on ? "var(--accent)" : "transparent"),
    marginBottom: -1,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: on ? 600 : 500,
    whiteSpace: "nowrap",
    color: on ? "var(--text-primary)" : "var(--text-secondary)",
  }),
  score: (color: string): CSSProperties => ({ fontSize: 12, fontWeight: 700, color }),
  deletedName: { fontStyle: "italic" } satisfies CSSProperties,
  panel: { display: "flex", flexDirection: "column", gap: 16, paddingTop: 16, maxWidth: 980 } satisfies CSSProperties,
  findings: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
