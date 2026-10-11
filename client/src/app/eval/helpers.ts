/* Pure helpers shared by the Eval Dashboard screens. */
import type { EvalRunRecord, EvalRunStatus } from "@devdigest/shared";
import { EM_DASH } from "@/lib/eval-format";

export type MetricKey = "recall" | "precision" | "citation_accuracy";

/** Compare accepts only finished runs: `running` and `errored` are rejected (EC-27, EC-34). */
export function isComparableStatus(status: EvalRunStatus): boolean {
  return status === "completed" || status === "partial";
}

/** A run's ratio for one metric; `null` when there is no metrics block or the denominator is 0. */
export function metricValue(
  run: Pick<EvalRunRecord, "metrics"> | null | undefined,
  key: MetricKey,
): number | null {
  return run?.metrics?.[key].value ?? null;
}

/** `{passed, total}` strings of a run's traces; "—" when the run has no metrics. */
export function passParts(run: Pick<EvalRunRecord, "metrics"> | null | undefined): {
  passed: string;
  total: string;
} {
  const m = run?.metrics;
  return m
    ? { passed: String(m.traces_passed), total: String(m.traces_total) }
    : { passed: EM_DASH, total: EM_DASH };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "2026-05-29 09:14" in local time; the raw string when it is not a date. */
export function formatRanAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Detail page of one agent. */
export function agentHref(agentId: string): string {
  return `/eval/agents/${encodeURIComponent(agentId)}`;
}
