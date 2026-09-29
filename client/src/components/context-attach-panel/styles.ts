import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 820, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, margin: 0 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.45 } satisfies CSSProperties,
  footer: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  warning: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 12.5,
    lineHeight: 1.45,
    wordBreak: "break-word",
  } satisfies CSSProperties,
} as const;
