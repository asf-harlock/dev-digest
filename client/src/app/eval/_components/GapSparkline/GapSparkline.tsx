/* GapSparkline — a Sparkline that leaves a gap for a null value instead of drawing 0
   (EC-36). Gap-free series of two or more points use the design-kit Sparkline as is;
   anything else is drawn here, scaled over the values that exist. */
import React from "react";
import { Sparkline } from "@devdigest/ui";
import { EM_DASH } from "@/lib/eval-format";
import { hasGap, sparkGeometry } from "./helpers";
import { s } from "./styles";

export function GapSparkline({
  data,
  color,
  label,
  w = 80,
  h = 24,
}: {
  data: (number | null)[];
  color: string;
  /** Accessible description of the series, e.g. "Recall over the last 10 runs". */
  label: string;
  w?: number;
  h?: number;
}) {
  const geo = sparkGeometry(data, w, h);
  if (geo.points.length === 0) {
    return <span style={s.empty}>{EM_DASH}</span>;
  }

  if (!hasGap(data) && data.length >= 2) {
    return (
      <span role="img" aria-label={label} style={s.box}>
        <Sparkline data={data as number[]} color={color} w={w} h={h} />
      </span>
    );
  }

  return (
    <span role="img" aria-label={label} style={s.box}>
      <svg width={w} height={h} style={s.svg} aria-hidden="true">
        {geo.path && (
          <path
            d={geo.path}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {geo.points
          .filter((p) => p.isolated)
          .map((p) => (
            <circle key={`${p.x}-${p.y}`} cx={p.x} cy={p.y} r={2} fill={color} />
          ))}
        {geo.last && !geo.last.isolated && <circle cx={geo.last.x} cy={geo.last.y} r={2} fill={color} />}
      </svg>
    </span>
  );
}
