import type { CSSProperties } from "react";

export const s = {
  bar: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--warn, var(--border-strong))",
    background: "var(--bg-surface)",
    fontSize: 13.5,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  title: { fontWeight: 600, margin: 0 } satisfies CSSProperties,
  text: { margin: 0, color: "var(--text-secondary)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
