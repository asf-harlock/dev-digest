import type { CSSProperties } from "react";

/** Co-located styles for IntentCard — follows VerdictBanner/FindingCard's
 *  dark "PR Brief" card idiom (elevated bg, 1px border, 10px radius). */
export const s = {
  wrap: { marginBottom: 4 } satisfies CSSProperties,
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  card: {
    padding: 18,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  summaryRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  summary: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-primary)",
    marginTop: 10,
  } satisfies CSSProperties,
  lists: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 20,
    marginTop: 16,
  } satisfies CSSProperties,
  listCol: { minWidth: 0 } satisfies CSSProperties,
  listLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 6,
  } satisfies CSSProperties,
  list: {
    margin: 0,
    paddingLeft: 18,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  } satisfies CSSProperties,
  listItem: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  warnings: {
    marginTop: 16,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  warningRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
  warningIcon: { flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
} as const;
