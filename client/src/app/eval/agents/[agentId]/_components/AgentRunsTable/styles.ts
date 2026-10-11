import type { CSSProperties } from "react";
import { MIN_TARGET_PX } from "../../../../constants";
import { shared } from "../../../../styles";

export const s = {
  ...shared,
  head: { display: "flex", alignItems: "center", gap: 12, marginBottom: 12, minHeight: 32 } satisfies CSSProperties,
  selected: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  compare: { marginLeft: "auto" } satisfies CSSProperties,
  checkCell: { ...shared.td, width: MIN_TARGET_PX + 16 } satisfies CSSProperties,
  checkLabel: (disabled: boolean): CSSProperties => ({
    display: "inline-grid",
    placeItems: "center",
    width: MIN_TARGET_PX,
    height: MIN_TARGET_PX,
    cursor: disabled ? "not-allowed" : "pointer",
  }),
  checkbox: { width: 16, height: 16, margin: 0 } satisfies CSSProperties,
  versionBtn: {
    background: "none",
    border: "none",
    padding: "0 4px",
    minHeight: MIN_TARGET_PX,
    minWidth: MIN_TARGET_PX,
    color: "var(--accent-text)",
    fontSize: 12.5,
    fontWeight: 600,
    cursor: "pointer",
  } satisfies CSSProperties,
  mono: { fontSize: 12.5, color: "var(--text-secondary)", whiteSpace: "nowrap" } satisfies CSSProperties,
  pass: { fontWeight: 700, whiteSpace: "nowrap" } satisfies CSSProperties,
  rowSelected: { background: "var(--accent-bg)" } satisfies CSSProperties,
} as const;
