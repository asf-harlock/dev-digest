import type { CSSProperties } from "react";

/** Co-located styles for ExpectedOutputPane. */
export const s = {
  head: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px 10px", flex: "0 0 auto" } satisfies CSSProperties,
  indicator: (ok: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
    fontSize: 12,
    fontWeight: 600,
    color: ok ? "var(--ok)" : "var(--crit)",
  }),
  indicatorText: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
