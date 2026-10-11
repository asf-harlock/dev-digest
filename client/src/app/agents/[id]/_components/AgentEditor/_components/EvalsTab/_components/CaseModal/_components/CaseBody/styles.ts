import type { CSSProperties } from "react";

/** Co-located styles for CaseBody. */
export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,
  state: { padding: "24px", fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { padding: "24px", fontSize: 14, color: "var(--crit)" } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  heading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  text: {
    fontSize: 14,
    lineHeight: 1.5,
    color: "var(--text-primary)",
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  muted: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "max-content 1fr",
    gap: "6px 16px",
    fontSize: 13,
    margin: 0,
  } satisfies CSSProperties,
  term: { color: "var(--text-muted)" } satisfies CSSProperties,
  def: { margin: 0, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  link: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    color: "var(--accent)",
    fontWeight: 600,
    fontSize: 14,
  } satisfies CSSProperties,
  resultRow: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "space-between", gap: 10 } satisfies CSSProperties,
} as const;
