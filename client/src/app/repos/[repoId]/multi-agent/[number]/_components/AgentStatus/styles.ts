import type { CSSProperties } from "react";

export const s = {
  wrap: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    color,
    whiteSpace: "nowrap",
  }),
} as const;
