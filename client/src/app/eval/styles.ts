import type { CSSProperties } from "react";
import { MIN_TARGET_PX } from "./constants";

/** Route-level style pieces reused by the dashboard and the detail page. */
export const shared = {
  /** Text for screen readers only. */
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
    border: 0,
  } satisfies CSSProperties,
  page: { padding: "28px 36px 48px", maxWidth: 1240 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  tableWrap: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflowX: "auto",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 14px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "middle",
  } satisfies CSSProperties,
  /** A cell that truncates with an ellipsis (EC-29); pair with a `title` attribute. */
  ellipsis: {
    display: "block",
    maxWidth: 240,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  /** Row that opens something on click. */
  clickableRow: { cursor: "pointer" } satisfies CSSProperties,
  link: {
    color: "var(--accent-text)",
    fontWeight: 600,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    minHeight: MIN_TARGET_PX,
  } satisfies CSSProperties,
  mutedText: { color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
