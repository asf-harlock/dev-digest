import type { CSSProperties } from "react";

/** Tailwind Preflight resets headings, lists and code, so restore them. */
export const s = {
  root: { lineHeight: 1.55 } satisfies CSSProperties,
  p: { margin: "0 0 10px" } satisfies CSSProperties,
  h1: { fontSize: "1.5em", fontWeight: 700, margin: "0 0 12px", color: "var(--text-primary)" } satisfies CSSProperties,
  h2: { fontSize: "1.25em", fontWeight: 700, margin: "18px 0 10px", color: "var(--text-primary)" } satisfies CSSProperties,
  h3: { fontSize: "1.05em", fontWeight: 650, margin: "16px 0 8px", color: "var(--text-primary)" } satisfies CSSProperties,
  ul: { margin: "0 0 10px", paddingLeft: 22, listStyle: "disc" } satisfies CSSProperties,
  ol: { margin: "0 0 10px", paddingLeft: 22, listStyle: "decimal" } satisfies CSSProperties,
  li: { margin: "0 0 4px" } satisfies CSSProperties,
  code: {
    fontSize: "0.92em",
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--accent-text)",
  } satisfies CSSProperties,
  pre: {
    margin: "0 0 10px",
    padding: "10px 12px",
    borderRadius: 6,
    background: "var(--code-bg)",
    overflow: "auto",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  a: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
  img: { maxWidth: "100%" } satisfies CSSProperties,
  blockquote: {
    margin: "0 0 10px",
    padding: "2px 0 2px 12px",
    borderLeft: "2px solid var(--border-strong)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
