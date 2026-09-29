import type { CSSProperties } from "react";

export const s = {
  empty: {
    fontSize: 13.5,
    color: "var(--text-secondary)",
    padding: "8px 0",
  } satisfies CSSProperties,
} as const;
