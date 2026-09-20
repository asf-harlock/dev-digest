import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    marginBottom: 20,
  } satisfies CSSProperties,
  typeRow: { display: "flex", alignItems: "center", gap: 24 } satisfies CSSProperties,
  enabledLabel: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  slugError: { fontSize: 12, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  draftError: { fontSize: 12.5, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  } satisfies CSSProperties,
  footerLeft: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  footerButtons: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
