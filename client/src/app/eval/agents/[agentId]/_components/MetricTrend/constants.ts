import { METRIC_COLORS } from "../../../../constants";

/** Chart canvas in SVG user units; the SVG scales to the container width. */
export const CHART = { width: 720, height: 240, left: 46, right: 16, top: 14, bottom: 30 } as const;

/** Y gridlines as ratios (0..1). */
export const Y_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

/** At most this many x-axis labels, whatever the number of runs. */
export const MAX_X_LABELS = 10;

/** Series order, colour and dash — the dash distinguishes the lines without colour. */
export const SERIES = [
  { key: "recall", color: METRIC_COLORS.recall, dash: undefined },
  { key: "precision", color: METRIC_COLORS.precision, dash: "6 3" },
  { key: "citation_accuracy", color: METRIC_COLORS.citation, dash: "2 3" },
] as const;
