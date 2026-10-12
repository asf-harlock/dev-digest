import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 980, display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  section: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  sectionHead: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  metricsLabel: { fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)" } satisfies CSSProperties,
  sectionTitle: { fontSize: 15, fontWeight: 700 } satisfies CSSProperties,
  pill: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-primary)",
    border: "1px solid var(--border-strong)",
    borderRadius: 999,
    padding: "2px 10px",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  lift: { margin: 0, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  summaryError: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
} as const;
