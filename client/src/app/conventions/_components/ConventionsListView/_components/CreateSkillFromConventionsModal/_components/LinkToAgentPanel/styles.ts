import type { CSSProperties } from "react";

export const s = {
  wrap: { marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  hint: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  select: { flex: 1 } satisfies CSSProperties,
  linked: { fontSize: 13, color: "var(--ok)", marginTop: 20 } satisfies CSSProperties,
  empty: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 20 } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
} as const;
