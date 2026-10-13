import type { CSSProperties } from "react";

export const s = {
  body: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  footerSpacer: { flex: 1 } satisfies CSSProperties,
  steps: { padding: "14px 24px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
