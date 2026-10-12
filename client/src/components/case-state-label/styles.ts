import type { CSSProperties } from "react";

/** Co-located styles for CaseStateLabel. */
export const s = {
  wrap: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color,
    whiteSpace: "nowrap",
  }),
} as const;
