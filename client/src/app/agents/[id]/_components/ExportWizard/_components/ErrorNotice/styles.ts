import type { CSSProperties } from "react";

export const s = {
  box: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "12px 14px",
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--crit)",
    background: "var(--crit-bg, rgba(239,68,68,.08))",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", gap: 8 } satisfies CSSProperties,
  icon: { color: "var(--crit)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  text: { margin: 0, flex: 1, overflowWrap: "anywhere" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;
