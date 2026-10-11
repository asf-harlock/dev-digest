import type { CSSProperties } from "react";
import { shared } from "../../../../styles";

export const s = {
  ...shared,
  card: {
    marginTop: 18,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 18,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  svg: { width: "100%", height: "auto", display: "block", marginTop: 10 } satisfies CSSProperties,
  empty: { padding: "26px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 } satisfies CSSProperties,
} as const;
