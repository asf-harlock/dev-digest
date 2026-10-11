import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  wrap: { maxWidth: 980, display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  titleBlock: { flex: 1, minWidth: 200 } satisfies CSSProperties,
  title: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 2 } satisfies CSSProperties,
  dashboardLink: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
  } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  sectionHead: {
    display: "flex",
    alignItems: "baseline",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  passing: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  emptyLink: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    color: "var(--accent)",
    fontWeight: 600,
  } satisfies CSSProperties,
} as const;
