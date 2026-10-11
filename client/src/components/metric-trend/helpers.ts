/* Pure geometry for the trend chart. A null value breaks the line (EC-36). */
import { CHART, MAX_X_LABELS } from "./constants";

const innerW = CHART.width - CHART.left - CHART.right;
const innerH = CHART.height - CHART.top - CHART.bottom;

const isNum = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);

export function xFor(index: number, count: number): number {
  return count > 1 ? CHART.left + (index / (count - 1)) * innerW : CHART.left + innerW / 2;
}

/** The run's x as a percentage of the SVG width — the HTML overlay aligns with it. */
export function xPercent(index: number, count: number): number {
  return (xFor(index, count) / CHART.width) * 100;
}

/** Ratio 0..1 → SVG y; out-of-range values are clamped onto the plot. */
export function yFor(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return CHART.top + (1 - v) * innerH;
}

export interface SeriesGeometry {
  path: string;
  points: { x: number; y: number }[];
}

export function seriesGeometry(values: (number | null)[]): SeriesGeometry {
  const points: { x: number; y: number }[] = [];
  let path = "";
  values.forEach((v, i) => {
    if (!isNum(v)) return;
    const x = xFor(i, values.length);
    const y = yFor(v);
    const connected = i > 0 && isNum(values[i - 1] ?? null);
    path += `${connected ? "L" : path ? " M" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    points.push({ x, y });
  });
  return { path: path.trim(), points };
}

/** Which run indexes get an x-axis label so labels never collide. */
export function labelIndexes(count: number): number[] {
  const step = Math.max(1, Math.ceil(count / MAX_X_LABELS));
  const out: number[] = [];
  for (let i = 0; i < count; i += step) out.push(i);
  return out;
}
