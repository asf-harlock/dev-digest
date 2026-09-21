import type { CSSProperties } from "react";

export const s = {
  typeRow: { display: "flex", alignItems: "flex-end", gap: 24, marginBottom: 20 } satisfies CSSProperties,
  typeField: { flex: 1 } satisfies CSSProperties,
  enabledField: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  enabledLabel: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  enabledHint: { fontSize: 12, color: "var(--text-muted)", maxWidth: 220 } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  errorText: { fontSize: 12.5, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
} as const;
