import type { CSSProperties } from "react";

/** Co-located styles for BlastRadiusCard — same card chrome as IntentCard's
 *  styles.ts (label inside the card, `--border`/`--bg-elevated` frame), plus
 *  a warn-tinted degraded row and a muted one-liner for the "no downstream"
 *  state. */
export const s = {
  wrap: { marginBottom: 20 } satisfies CSSProperties,
  card: {
    padding: 24,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  } satisfies CSSProperties,
  headerIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  degradedRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--warn-bg)",
    marginBottom: 16,
  } satisfies CSSProperties,
  degradedIcon: { color: "var(--warn)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  degradedText: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontSize: 13,
    color: "var(--text-primary)",
    minWidth: 160,
  } satisfies CSSProperties,
  degradedHint: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  noDownstream: {
    fontSize: 13.5,
    color: "var(--text-secondary)",
    padding: "8px 0",
  } satisfies CSSProperties,
} as const;
