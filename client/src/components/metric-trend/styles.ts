import type { CSSProperties } from "react";
import { CHART, TARGET_PX } from "./constants";

export const s = {
  card: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 18,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 } satisfies CSSProperties,
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  plot: { position: "relative", marginTop: 10 } satisfies CSSProperties,
  svg: { width: "100%", height: "auto", display: "block" } satisfies CSSProperties,
  empty: { padding: "26px 0", textAlign: "center", color: "var(--text-secondary)", fontSize: 14 } satisfies CSSProperties,
  /** Overlay of one native button per run, aligned with the SVG through percentages. */
  targets: {
    position: "absolute",
    left: 0,
    right: 0,
    top: `${(CHART.top / CHART.height) * 100}%`,
    height: `${((CHART.height - CHART.top - CHART.bottom) / CHART.height) * 100}%`,
    margin: 0,
    padding: 0,
    listStyle: "none",
  } satisfies CSSProperties,
  tooltip: {
    position: "absolute",
    top: 0,
    zIndex: 2,
    maxWidth: 340,
    padding: "8px 10px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.4,
    pointerEvents: "none",
  } satisfies CSSProperties,
} as const;

/** One run's target: a TARGET_PX-wide, plot-high column centred on the run's x. */
export function targetStyle(xPercent: number): CSSProperties {
  return {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: `calc(${xPercent}% - ${TARGET_PX / 2}px)`,
    width: TARGET_PX,
    minWidth: TARGET_PX,
    minHeight: TARGET_PX,
    margin: 0,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "default",
  };
}

/** Anchor the tooltip so it stays inside the card near either edge. */
export function tooltipStyle(xPercent: number): CSSProperties {
  if (xPercent < 25) return { ...s.tooltip, left: `calc(${xPercent}% - ${TARGET_PX / 2}px)` };
  if (xPercent > 75) return { ...s.tooltip, right: `calc(${100 - xPercent}% - ${TARGET_PX / 2}px)` };
  return { ...s.tooltip, left: `${xPercent}%`, transform: "translateX(-50%)" };
}
