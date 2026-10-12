import type { CSSProperties } from "react";

/** Co-located styles for RunDialog. */
export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  help: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 } satisfies CSSProperties,
  counts: { fontSize: 14, fontWeight: 600 } satisfies CSSProperties,
  warning: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  warningIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 1 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
