/* Pure geometry for GapSparkline. A `null` value is a gap in the line (EC-36). */

export interface SparkPoint {
  x: number;
  y: number;
  /** True when no neighbour is drawn on either side, so the point needs its own dot. */
  isolated: boolean;
}

export interface SparkGeometry {
  /** SVG path data; one `M…L…` run per stretch of consecutive values. */
  path: string;
  points: SparkPoint[];
  /** The last value present, where the end dot goes. */
  last: SparkPoint | null;
}

const isNum = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v);

export function hasGap(data: (number | null)[]): boolean {
  return data.some((v) => !isNum(v));
}

export function sparkGeometry(data: (number | null)[], w: number, h: number): SparkGeometry {
  const present = data.filter(isNum);
  if (present.length === 0) return { path: "", points: [], last: null };
  const min = Math.min(...present);
  const max = Math.max(...present);
  const span = max - min || 1;
  const xFor = (i: number) => (data.length > 1 ? (i / (data.length - 1)) * w : w / 2);
  const yFor = (v: number) => h - ((v - min) / span) * (h - 4) - 2;

  const points: SparkPoint[] = [];
  let path = "";
  data.forEach((v, i) => {
    if (!isNum(v)) return;
    const x = xFor(i);
    const y = yFor(v);
    const prevPresent = i > 0 && isNum(data[i - 1] ?? null);
    const nextPresent = i < data.length - 1 && isNum(data[i + 1] ?? null);
    path += `${prevPresent ? "L" : path ? " M" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    points.push({ x, y, isolated: !prevPresent && !nextPresent });
  });
  return { path: path.trim(), points, last: points[points.length - 1] ?? null };
}
