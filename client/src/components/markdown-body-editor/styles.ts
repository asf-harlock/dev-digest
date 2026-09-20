import type { CSSProperties } from "react";

export const s = {
  editorRow: {
    display: "flex",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    overflow: "hidden",
    maxHeight: 420,
  } satisfies CSSProperties,
  gutter: {
    padding: "10px 10px 10px 12px",
    textAlign: "right",
    color: "var(--text-muted)",
    fontSize: 13,
    lineHeight: 1.55,
    userSelect: "none",
    borderRight: "1px solid var(--border)",
    overflow: "hidden",
  } satisfies CSSProperties,
  lineNo: { minWidth: 24 } satisfies CSSProperties,
  textarea: {
    flex: 1,
    resize: "vertical",
    padding: "10px 12px",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
