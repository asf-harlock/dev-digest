import type { CSSProperties } from "react";

export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 16,
  } satisfies CSSProperties,
  stats: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 18,
  } satisfies CSSProperties,
  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  statIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  segmented: {
    marginLeft: "auto",
    display: "flex",
    gap: 2,
    padding: 2,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
} as const;
