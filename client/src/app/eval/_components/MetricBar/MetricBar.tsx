/* MetricBar — a thin bar plus the integer percent next to it. The number is the
   accessible content; the bar is decoration (a null value shows an empty bar and "—"). */
import React from "react";
import { formatPercent } from "@/lib/eval-format";
import { s } from "./styles";

export function MetricBar({ value, color }: { value: number | null; color: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div style={s.wrap}>
      <div aria-hidden="true" style={s.track}>
        <div style={s.fill(color, pct)} />
      </div>
      <span className="tnum" style={s.text}>
        {formatPercent(value)}
      </span>
    </div>
  );
}
