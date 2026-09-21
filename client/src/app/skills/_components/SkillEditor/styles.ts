import type { CSSProperties } from "react";

export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, padding: "16px 28px 0", flexShrink: 0 } satisfies CSSProperties,
  h1: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: 28 } satisfies CSSProperties,
  injectionBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 28px",
    background: "var(--crit-bg)",
    borderBottom: "1px solid var(--crit)",
    flexShrink: 0,
  } satisfies CSSProperties,
  injectionBannerTitle: { color: "var(--crit)", fontWeight: 700, fontSize: 13 } satisfies CSSProperties,
  injectionBannerBody: { color: "var(--text-secondary)", fontSize: 13, marginLeft: 6 } satisfies CSSProperties,
} as const;
