import type { CSSProperties } from "react";

/** The Overview blocks share one gap and the PR Brief card chrome
 *  (label inside the card). `BLOCK_GAP` matches `PrBrief/styles.ts`. */
export const BLOCK_GAP = 16;

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: BLOCK_GAP } satisfies CSSProperties,
  card: {
    padding: 24,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    minWidth: 0,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } satisfies CSSProperties,
  headerIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  body: {
    fontSize: 14,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
} as const;
