import type { CSSProperties } from "react";
import { BODY_HEIGHT, STACKED_PANE_HEIGHT } from "./constants";

/** Co-located styles for CaseEditor and its parts. */
export const s = {
  /** The editor's form, inside the kit `Modal` body. Wide: a fixed-height two-column grid that
   *  clips (`overflow: hidden`, `min-height: 0`), so the kit body never scrolls and each text
   *  pane scrolls inside itself (AC-24, NFR-11). Narrow (EC-11): natural height, columns
   *  stacked, the kit body is the one scroll region. */
  body: (narrow: boolean): CSSProperties =>
    narrow
      ? { display: "flex", flexDirection: "column", gap: 0, margin: 0 }
      : {
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          height: BODY_HEIGHT,
          minHeight: 0,
          overflow: "hidden",
          margin: 0,
        },
  /** One of the two columns: a flex column that never grows past the grid row. */
  column: (narrow: boolean): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: "16px 20px",
    minWidth: 0,
    minHeight: 0,
    overflow: narrow ? "visible" : "hidden",
  }),
  /** Name and Notes side by side, so the Input block keeps its height (AC-15). */
  pair: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, flex: "0 0 auto" } satisfies CSSProperties,
  columnDivider: { borderLeft: "1px solid var(--border)" } satisfies CSSProperties,
  columnDividerStacked: { borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  /** A block that fills its share of the column and holds one scrolling text pane. */
  fill: (narrow: boolean): CSSProperties =>
    narrow
      ? { display: "flex", flexDirection: "column", gap: 6, minWidth: 0, height: STACKED_PANE_HEIGHT + 40 }
      : { display: "flex", flexDirection: "column", gap: 6, minWidth: 0, minHeight: 0, flex: "1 1 0", overflow: "hidden" },
  /** The text pane itself: fills its block and scrolls inside itself (AC-24). */
  pane: {
    flex: "1 1 0",
    minHeight: 0,
    width: "100%",
    overflow: "auto",
    resize: "none",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  paneReadOnly: { background: "var(--bg-surface)" } satisfies CSSProperties,
  /** The result banner slot above the footer buttons . Fixed: it sits in the
   *  kit footer, outside both columns, so it can never overlap their content (AC-23). */
  bannerSlot: { minWidth: 0 } satisfies CSSProperties,
  /** The stalled-run message under the banner (EC-23, EC-24). */
  stalled: { marginTop: 6 } satisfies CSSProperties,
  subtitleBlock: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  error: { padding: "24px", fontSize: 14, color: "var(--crit)" } satisfies CSSProperties,
  loading: { padding: "18px 24px", display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  heading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--text-muted)",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  muted: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  note: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 7,
    background: "var(--bg-surface)",
    padding: "8px 12px",
  } satisfies CSSProperties,
  link: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: 24,
    color: "var(--accent)",
    fontWeight: 600,
    fontSize: 14,
  } satisfies CSSProperties,
  field: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  label: { fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  labelRow: { display: "flex", alignItems: "baseline", gap: 4 } satisfies CSSProperties,
  required: { color: "var(--crit)", fontSize: 12, fontWeight: 700 } satisfies CSSProperties,
  hint: { fontSize: 12, lineHeight: 1.45, color: "var(--text-muted)" } satisfies CSSProperties,
  fieldError: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  control: {
    width: "100%",
    minHeight: 36,
    padding: "8px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 14,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  textarea: { resize: "none" } satisfies CSSProperties,
  footerWrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  rejection: { fontSize: 13, lineHeight: 1.45, color: "var(--crit)" } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  spacer: { flex: 1, minWidth: 0, textAlign: "right" } satisfies CSSProperties,
  /** Why **Run case** is disabled (AC-34), in the free space left of the buttons. */
  runHint: { fontSize: 12, lineHeight: 1.4, color: "var(--text-secondary)" } satisfies CSSProperties,
  confirmBody: { padding: "18px 24px", fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  confirmFooter: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
} as const;
