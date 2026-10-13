import type { CSSProperties } from "react";

/** Co-located styles for FailOnControl. */
export const s = {
  panel: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    padding: "12px 16px",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    borderRadius: 8,
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  text: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 220 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 } satisfies CSSProperties,
  group: {
    display: "inline-flex",
    padding: 3,
    gap: 2,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  segment: {
    padding: "5px 12px",
    borderWidth: 0,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: 6,
    background: "transparent",
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  segmentOn: {
    background: "var(--accent)",
    color: "#fff",
    fontWeight: 600,
  } satisfies CSSProperties,
  segmentDisabled: { opacity: 0.6, cursor: "not-allowed" } satisfies CSSProperties,
} as const;
