import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseButton. */
export const s = {
  wrap: { display: "inline-flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  hintWrap: { display: "inline-flex" } satisfies CSSProperties,
  inSet: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
    padding: "5px 9px",
    fontSize: 12.5,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--ok)",
    lineHeight: 1.2,
  } satisfies CSSProperties,
  error: { fontSize: 12.5, lineHeight: 1.4, color: "var(--crit)", maxWidth: 420 } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
