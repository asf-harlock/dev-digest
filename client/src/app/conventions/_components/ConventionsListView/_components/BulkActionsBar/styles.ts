import type { CSSProperties } from "react";

export const s = {
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 4,
  } satisfies CSSProperties,
  left: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  counter: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
