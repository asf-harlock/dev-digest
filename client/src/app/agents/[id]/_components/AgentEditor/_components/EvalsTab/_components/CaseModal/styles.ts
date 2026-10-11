import type { CSSProperties } from "react";

/** Co-located styles for CaseModal. */
export const s = {
  body: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 22 } satisfies CSSProperties,
  error: { padding: "24px", fontSize: 14, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "space-between", gap: 10 } satisfies CSSProperties,
} as const;
