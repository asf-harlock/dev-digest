import type { CSSProperties } from "react";

export const s = {
  agent: {
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,
  summary: {
    fontSize: 12,
    color: "var(--text-muted)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
} as const;
