import type { CSSProperties } from "react";

export const s = {
  meta: { display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
  toggle: { marginBottom: 12 } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { fontSize: 13, lineHeight: 1.55, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
} as const;
