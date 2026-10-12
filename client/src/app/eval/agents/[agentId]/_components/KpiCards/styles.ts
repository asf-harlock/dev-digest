import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", gap: 14, flexWrap: "wrap", marginTop: 22 } satisfies CSSProperties,
} as const;
