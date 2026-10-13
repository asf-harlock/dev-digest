import type { CSSProperties } from "react";

export const s = {
  // Five or more columns scroll sideways instead of squeezing or overlapping.
  row: {
    display: "flex",
    alignItems: "stretch",
    gap: 16,
    overflowX: "auto",
    paddingBottom: 6,
  } satisfies CSSProperties,
} as const;
