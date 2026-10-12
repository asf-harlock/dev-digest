import type { EvalMetrics } from "@devdigest/shared";
import {
  deltaDirection,
  deltaPoints,
  formatDeltaPoints,
  formatPassRatio,
  formatPercent,
  type DeltaDirection,
} from "@/lib/eval-format";

export type KpiKey = "recall" | "precision" | "citation" | "traces";

/** Card → `eval.evalsTab.kpi.*` label key. Traces passed is `tracesPassed` in the messages. */
export const KPI_LABEL_KEY: Record<KpiKey, string> = {
  recall: "recall",
  precision: "precision",
  citation: "citation",
  traces: "tracesPassed",
};

/** Everything a KPI tile renders, already formatted. Captions are i18n keys + values. */
export interface KpiModel {
  key: KpiKey;
  value: string;
  /** "▲ 4 pt" — null for a card with no delta (Traces passed). */
  deltaText: string | null;
  direction: DeltaDirection;
  /** Signed whole points, for the screen-reader sentence. */
  points: number | null;
  caption: { key: `kpi.${string}`; values: Record<string, number> } | null;
}

/** Four cards for the latest finished run's metrics vs. the previous one's (SPEC-08 AC-35,
 *  AC-36). An agent run passes `run.metrics`; a skill run passes the with-skill arm
 *  (`run.with`, SPEC-10 AC-31). Without a finished run — or without metrics — every value
 *  is "—" (SPEC-08 EC-19, EC-23). */
export function buildKpis(
  m: EvalMetrics | null,
  p: EvalMetrics | null,
  pointsUnit: string,
): KpiModel[] {

  const ratioCard = (
    key: "recall" | "precision" | "citation",
    pick: (x: NonNullable<typeof m>) => { value: number | null },
    caption: KpiModel["caption"],
  ): KpiModel => {
    const now = m ? pick(m).value : null;
    const before = p ? pick(p).value : null;
    const points = deltaPoints(now, before);
    return {
      key,
      value: formatPercent(now),
      deltaText: formatDeltaPoints(now, before, pointsUnit),
      direction: deltaDirection(points),
      points,
      caption: m ? caption : { key: "kpi.noRunYet", values: {} },
    };
  };

  return [
    ratioCard("recall", (x) => x.recall, m && {
      key: "kpi.recallCaption",
      values: { passed: m.recall.num, scored: m.recall.den },
    }),
    ratioCard("precision", (x) => x.precision, m && {
      key: "kpi.precisionCaption",
      values: { tp: m.tp, fp: m.fp, unlabeled: m.unlabeled },
    }),
    ratioCard("citation", (x) => x.citation_accuracy, m && {
      key: "kpi.citationCaption",
      values: { kept: m.citation_accuracy.num, total: m.citation_accuracy.den },
    }),
    {
      key: "traces",
      value: m ? formatPassRatio(m.traces_passed, m.traces_total) : formatPassRatio(null, null),
      deltaText: null,
      direction: "none",
      points: null,
      caption: m
        ? { key: "kpi.tracesCaption", values: { errored: m.cases_errored } }
        : { key: "kpi.noRunYet", values: {} },
    },
  ];
}
