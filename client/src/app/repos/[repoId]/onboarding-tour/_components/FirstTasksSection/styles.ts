import type { CSSProperties } from "react";

export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 } satisfies CSSProperties,
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 14,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  title: { margin: 0, fontSize: 14, fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  desc: { margin: 0, color: "var(--text-secondary)" } satisfies CSSProperties,
  path: { fontSize: 12, color: "var(--text-muted)", overflowWrap: "anywhere" } satisfies CSSProperties,
  chipWrap: { alignSelf: "flex-start", display: "inline-flex", marginTop: 4 } satisfies CSSProperties,
  chip: {
    alignSelf: "flex-start",
    padding: "4px 10px",
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border-strong)",
    fontSize: 13,
  } satisfies CSSProperties,
  /** Visually hidden, still read by screen readers. */
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
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
