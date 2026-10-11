import type { CSSProperties } from "react";
import { shared } from "../../../../../../styles";

export const s = {
  ...shared,
  row: {
    padding: "12px 0",
    borderBottom: "1px solid var(--border)",
    listStyle: "none",
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  name: { ...shared.ellipsis, maxWidth: 320, fontWeight: 600, fontSize: 14 } satisfies CSSProperties,
  meta: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 6,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  error: { marginTop: 6, fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  findings: { margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  finding: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    listStyle: "none",
    minWidth: 0,
  } satisfies CSSProperties,
  location: { flexShrink: 0, color: "var(--text-secondary)", fontSize: 12.5 } satisfies CSSProperties,
  findingTitle: { ...shared.ellipsis, maxWidth: 360, flex: 1 } satisfies CSSProperties,
  none: { marginTop: 6, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
