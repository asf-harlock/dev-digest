/* eval-format.ts — display formatters for the Eval Pipeline (specs/08-eval-pipeline.md).
   Pure functions, no i18n and no React. The server returns raw ratios and costs
   only; every percentage, delta and cost string is produced here (NFR-8, NQ-2).
   "—" is the single "no value" glyph: a null metric is never shown as 0% (EC-19),
   a null delta is "—" (EC-20), a null cost is "—" and never "$0.00" (EC-21). */

import type { EvalCaseLatestResult } from "@devdigest/shared";

/** The "no value" glyph. */
export const EM_DASH = "—";

const ARROW_UP = "▲";
const ARROW_DOWN = "▼";

function isNum(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Whole-number percent of a 0..1 ratio: `0.756` → "76%"; null → "—". */
export function formatPercent(value: number | null | undefined): string {
  if (!isNum(value)) return EM_DASH;
  return `${Math.round(value * 100)}%`;
}

/** Signed delta in whole points between two 0..1 ratios:
 *  `round(new·100) − round(old·100)`. Null when either side is missing. */
export function deltaPoints(
  newValue: number | null | undefined,
  oldValue: number | null | undefined,
): number | null {
  if (!isNum(newValue) || !isNum(oldValue)) return null;
  return Math.round(newValue * 100) - Math.round(oldValue * 100);
}

export type DeltaDirection = "up" | "down" | "flat" | "none";

/** Direction of a delta; `none` when there is nothing to compare. */
export function deltaDirection(points: number | null | undefined): DeltaDirection {
  if (!isNum(points)) return "none";
  if (points > 0) return "up";
  if (points < 0) return "down";
  return "flat";
}

/**
 * "▲ 4 pt" / "▼ 2 pt" / "0 pt"; "—" when either side is null.
 * The arrow carries the direction in addition to colour (NFR-7).
 * Pass a localized `unit` to override the default "pt".
 */
export function formatDeltaPoints(
  newValue: number | null | undefined,
  oldValue: number | null | undefined,
  unit = "pt",
): string {
  const points = deltaPoints(newValue, oldValue);
  if (points === null) return EM_DASH;
  if (points > 0) return `${ARROW_UP} ${points} ${unit}`;
  if (points < 0) return `${ARROW_DOWN} ${Math.abs(points)} ${unit}`;
  return `0 ${unit}`;
}

/** Dollars with two decimals: `0.1234` → "$0.12"; null → "—". */
export function formatCostUsd(value: number | null | undefined): string {
  if (!isNum(value)) return EM_DASH;
  return `$${value.toFixed(2)}`;
}

/** Signed cost delta for the Compare cost card: "▲ $0.12" / "▼ $0.03" / "$0.00";
 *  "—" when either side is null. Compared on the rounded cents shown. */
export function formatCostDeltaUsd(
  newValue: number | null | undefined,
  oldValue: number | null | undefined,
): string {
  if (!isNum(newValue) || !isNum(oldValue)) return EM_DASH;
  const cents = Math.round(newValue * 100) - Math.round(oldValue * 100);
  const abs = `$${(Math.abs(cents) / 100).toFixed(2)}`;
  if (cents > 0) return `${ARROW_UP} ${abs}`;
  if (cents < 0) return `${ARROW_DOWN} ${abs}`;
  return abs;
}

/** Milliseconds as "420ms" under a second, "1.8s" under a minute, else "2m 5s";
 *  null / negative → "—". */
export function formatDuration(ms: number | null | undefined): string {
  if (!isNum(ms) || ms < 0) return EM_DASH;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/** "{passed}/{total}" (Traces passed, run tables); "—" when either is null. */
export function formatPassRatio(
  passed: number | null | undefined,
  total: number | null | undefined,
): string {
  if (!isNum(passed) || !isNum(total)) return EM_DASH;
  return `${passed}/${total}`;
}

/** `file:start-end` — the location tag of a case or a finding. */
export function formatLineRange(file: string, startLine: number, endLine: number): string {
  return `${file}:${startLine}-${endLine}`;
}

/** What a case row shows as its latest result. "never run" is `null` upstream. */
export type EvalCaseState = "passed" | "failed" | "errored" | "never_run";

export function evalCaseState(
  latest: Pick<EvalCaseLatestResult, "state"> | null | undefined,
): EvalCaseState {
  return latest ? latest.state : "never_run";
}
