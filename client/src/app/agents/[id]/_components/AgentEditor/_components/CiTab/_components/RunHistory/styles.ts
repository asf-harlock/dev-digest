import type { CSSProperties } from "react";

/** Co-located styles for RunHistory. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 700 } satisfies CSSProperties,
  scroll: {
    overflowX: "auto",
    // Containing block for the absolutely-positioned srOnly spans below: without it they escape
    // this scroller and widen the page at 768 px.
    position: "relative",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    padding: "8px 12px",
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: {
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
    verticalAlign: "middle",
  } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  link: { color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-secondary)", padding: "12px 4px" } satisfies CSSProperties,
} as const;
