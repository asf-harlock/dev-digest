import type { CSSProperties } from "react";

export const s = {
  list: { display: "flex", alignItems: "center", listStyle: "none", margin: 0, padding: "0 5px" } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 10, flex: 1 } satisfies CSSProperties,
  itemLast: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  circle: {
    width: 24,
    height: 24,
    borderRadius: 99,
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  } satisfies CSSProperties,
  label: { fontSize: 13, whiteSpace: "nowrap" } satisfies CSSProperties,
  line: { flex: 1, height: 1, minWidth: 24, margin: "0 14px" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
