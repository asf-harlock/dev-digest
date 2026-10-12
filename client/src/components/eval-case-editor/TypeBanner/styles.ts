import type { CSSProperties } from "react";

/** Co-located styles for TypeBanner. */
export const s = {
  banner: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    minWidth: 0,
    padding: "8px 12px",
    borderRadius: 7,
    // No `border` shorthand next to a per-side width: React warns when `color` changes.
    borderStyle: "solid",
    borderColor: color,
    borderWidth: "1px 1px 1px 4px",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    flex: "0 0 auto",
  }),
  label: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color,
    whiteSpace: "nowrap",
  }),
  text: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  switch: { display: "inline-flex", gap: 2 } satisfies CSSProperties,
  choice: (on: boolean): CSSProperties => ({
    minHeight: 24,
    padding: "2px 10px",
    fontSize: 12,
    fontWeight: on ? 700 : 500,
    borderRadius: 5,
    border: `1px solid ${on ? "var(--border-strong)" : "transparent"}`,
    background: on ? "var(--bg-elevated)" : "transparent",
    color: "var(--text-primary)",
    cursor: "pointer",
  }),
} as const;
