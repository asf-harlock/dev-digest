import type { CSSProperties } from "react";
import { shared } from "../../../../styles";

export const s = {
  ...shared,
  back: { ...shared.link, gap: 4, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginTop: 8 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  name: { ...shared.h1, ...shared.ellipsis, maxWidth: 420 } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  live: { marginTop: 10, minHeight: 20, fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  error: { color: "var(--crit)" } satisfies CSSProperties,
} as const;
