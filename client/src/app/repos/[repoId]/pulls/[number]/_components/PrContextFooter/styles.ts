import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 6, fontSize: 13 } satisfies CSSProperties,
  total: { color: "var(--text-primary)" } satisfies CSSProperties,
  over: { color: "var(--warn)" } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
  hint: { color: "var(--text-muted)", fontSize: 12 } satisfies CSSProperties,
} as const;
