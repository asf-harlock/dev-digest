"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalCaseLatestResult } from "@devdigest/shared";
import { formatCostUsd, formatDuration } from "@/lib/eval-format";
import { bannerCount, effectKey } from "../helpers";
import { BANNER_VISUAL } from "./constants";
import { s } from "./styles";

/** The content of the result banner slot in the footer (SPEC-10 AC-41, AC-43, AC-44, NFR-10): the
 *  running banner while the case runs, else "Last run passed / failed / errored: {reason}" with
 *  `{passed}/{total} passed · {duration} · {cost}` (the count is derived from the result's `state`
 *  and omitted for an errored case; a `null` cost is "—") and, for a skill case, its effect label.
 *  Status is an icon plus text, never colour alone. The reason is model / provider text, rendered
 *  as escaped text and truncated with a `title` (EC-12). The slot itself (a `role="status"` live
 *  region that is always rendered) belongs to the editor. */
export function ResultBanner({
  running,
  latest,
}: {
  running: boolean;
  latest: EvalCaseLatestResult | null | undefined;
}) {
  const t = useTranslations("eval");
  if (running) {
    const { icon, color } = BANNER_VISUAL.running;
    const I = Icon[icon];
    return (
      <div style={s.banner(color)}>
        <I size={16} aria-hidden="true" style={s.spin} />
        <span style={s.title}>{t("caseRun.banner.running")}</span>
      </div>
    );
  }
  if (!latest) return null;
  const { icon, color } = BANNER_VISUAL[latest.state];
  const I = Icon[icon];
  const count = bannerCount(latest.state);
  const facts = { duration: formatDuration(latest.duration_ms), cost: formatCostUsd(latest.cost_usd) };
  const title =
    latest.state === "passed"
      ? t("caseRun.banner.passed")
      : latest.state === "failed"
        ? t("caseRun.banner.failed")
        : latest.error_reason
          ? t("caseRun.banner.errored", { reason: latest.error_reason })
          : t("caseRun.banner.erroredNoReason");
  return (
    <div style={s.banner(color)}>
      <I size={16} aria-hidden="true" style={s.icon(color)} />
      <span style={s.title} title={title}>
        {title}
      </span>
      <span style={s.stats}>
        {count
          ? t("caseRun.banner.stats", { ...count, ...facts })
          : t("caseRun.banner.statsErrored", facts)}
      </span>
      {latest.effect && (
        <span style={s.stats}>{t("caseRun.banner.effect", { effect: t(`caseRun.banner.effectLabels.${effectKey(latest.effect)}`) })}</span>
      )}
    </div>
  );
}
