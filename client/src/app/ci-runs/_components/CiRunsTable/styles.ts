import type { CSSProperties } from "react";

export const s = {
  wrap: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflowX: "auto",
    // Containing block for the absolutely-positioned srOnly spans: without it they escape this
    // scroller and widen the page (document scrollWidth > viewport at 768 px).
    position: "relative",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed", minWidth: 900 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 10px",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
    // Wrap rather than clip: in a fixed-layout table a nowrap header overlaps its neighbour.
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  td: { padding: "10px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" } satisfies CSSProperties,
  /** A cell that truncates with an ellipsis (EC-32); the full text sits in `title` and in the DOM. */
  ellipsis: {
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  repo: { color: "var(--text-primary)", fontWeight: 600 } satisfies CSSProperties,
  link: { color: "var(--accent-text)", fontWeight: 600, textDecoration: "none" } satisfies CSSProperties,
  muted: { color: "var(--text-muted)" } satisfies CSSProperties,
  /** Relative time may wrap inside its column instead of overlapping the Job cell. */
  time: { color: "var(--text-secondary)" } satisfies CSSProperties,
  num: { whiteSpace: "nowrap", color: "var(--text-secondary)" } satisfies CSSProperties,
  outcome: { display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" } satisfies CSSProperties,
  reason: { fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
} as const;
