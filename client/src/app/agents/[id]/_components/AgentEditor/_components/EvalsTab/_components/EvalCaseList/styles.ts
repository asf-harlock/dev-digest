import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseList. */
export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
