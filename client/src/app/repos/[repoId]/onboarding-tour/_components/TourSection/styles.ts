import type { CSSProperties } from "react";

export const s = {
  section: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  heading: { margin: 0, fontSize: 16, fontWeight: 650, outline: "none" } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    minHeight: 24,
    padding: "14px 18px",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    font: "inherit",
    fontWeight: 650,
    textAlign: "left",
    cursor: "pointer",
  } satisfies CSSProperties,
  iconBox: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 7,
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: { flex: 1 } satisfies CSSProperties,
  panel: { padding: "0 18px 18px", fontSize: 13.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
