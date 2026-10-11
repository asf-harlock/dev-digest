import type { CSSProperties } from "react";

export const s = {
  box: { display: "inline-flex", lineHeight: 0 } satisfies CSSProperties,
  svg: { display: "block", overflow: "visible" } satisfies CSSProperties,
  empty: { color: "var(--text-secondary)", fontSize: 13 } satisfies CSSProperties,
} as const;
