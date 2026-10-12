import type { CSSProperties } from "react";

/** Co-located styles for DeleteCaseDialog. */
export const s = {
  body: { padding: "18px 24px", fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { marginTop: 10, fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
