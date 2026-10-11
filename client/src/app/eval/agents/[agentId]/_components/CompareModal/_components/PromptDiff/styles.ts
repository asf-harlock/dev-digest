import type { CSSProperties } from "react";
import { shared } from "../../../../../../styles";

export const s = {
  ...shared,
  heading: { ...shared.sectionTitle, margin: "22px 0 8px", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px" } satisfies CSSProperties,
  box: {
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 0",
    maxHeight: 360,
    overflow: "auto",
  } satisfies CSSProperties,
  line: (kind: "added" | "removed" | "context"): CSSProperties => ({
    display: "flex",
    gap: 10,
    padding: "1px 12px",
    fontSize: 13,
    lineHeight: 1.5,
    background: kind === "added" ? "var(--ok-bg)" : kind === "removed" ? "var(--crit-bg)" : "transparent",
  }),
  marker: { width: 14, flexShrink: 0, fontWeight: 700, textAlign: "center" } satisfies CSSProperties,
  text: {
    flex: 1,
    margin: 0,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontFamily: "inherit",
  } satisfies CSSProperties,
  unchanged: { fontSize: 13, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
} as const;
