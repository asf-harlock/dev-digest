import type { CSSProperties } from "react";

/** Co-located styles for CaseNameForm. */
export const s = {
  form: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  row: { display: "flex", alignItems: "stretch", gap: 10 } satisfies CSSProperties,
  field: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  error: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
} as const;
