import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  title: { fontSize: 12, color: "var(--text-muted)", fontWeight: 600 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 10, fontSize: 13 } satisfies CSSProperties,
  path: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  reason: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
