import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "inline-flex",
    padding: 3,
    gap: 2,
    background: "var(--bg-elevated)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  option: (on: boolean): CSSProperties => ({
    padding: "5px 14px",
    fontSize: 13,
    fontWeight: on ? 600 : 500,
    borderRadius: 6,
    borderWidth: 0,
    cursor: "pointer",
    color: on ? "var(--text-primary)" : "var(--text-muted)",
    background: on ? "var(--bg-hover)" : "transparent",
  }),
} as const;
