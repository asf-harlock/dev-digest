import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  item: { display: "flex", gap: 12, alignItems: "flex-start" } satisfies CSSProperties,
  num: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    borderRadius: 99,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  } satisfies CSSProperties,
  path: { color: "var(--text-primary)", fontSize: 13, overflowWrap: "anywhere" } satisfies CSSProperties,
  active: { fontFamily: "inherit", fontWeight: 650 } satisfies CSSProperties,
  why: { margin: "2px 0 0", color: "var(--text-secondary)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
