import type { CSSProperties } from "react";

export const s = {
  body: { color: "var(--text-secondary)", lineHeight: 1.55 } satisfies CSSProperties,
  diagram: { marginTop: 12 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
} as const;
