import type { CSSProperties } from "react";

export const s = {
  nav: { position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: "0 0 8px 12px",
  } satisfies CSSProperties,
  link: {
    display: "block",
    minHeight: 24,
    padding: "6px 12px",
    borderLeft: "2px solid transparent",
    color: "var(--text-secondary)",
    fontSize: 13.5,
    textDecoration: "none",
  } satisfies CSSProperties,
  linkActive: {
    borderLeftColor: "var(--accent)",
    color: "var(--text-primary)",
    fontWeight: 650,
  } satisfies CSSProperties,
} as const;
