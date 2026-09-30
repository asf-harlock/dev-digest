import type { CSSProperties } from "react";

export const s = {
  group: { border: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  legend: { fontSize: 12, fontWeight: 650, color: "var(--text-secondary)", padding: 0, marginBottom: 4 } satisfies CSSProperties,
  option: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, minHeight: 24, color: "var(--text-primary)" } satisfies CSSProperties,
  optionDisabled: { color: "var(--text-muted)" } satisfies CSSProperties,
  reason: { fontSize: 12, color: "var(--text-muted)", margin: "0 0 0 24px" } satisfies CSSProperties,
  days: { display: "flex", alignItems: "center", gap: 8, margin: "4px 0 0 24px", fontSize: 13 } satisfies CSSProperties,
  input: {
    width: 72,
    minHeight: 24,
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    font: "inherit",
  } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", margin: "0 0 0 24px" } satisfies CSSProperties,
  warning: {
    display: "flex",
    gap: 6,
    fontSize: 12,
    color: "var(--text-secondary)",
    margin: "4px 0 0 24px",
    maxWidth: 320,
  } satisfies CSSProperties,
} as const;
