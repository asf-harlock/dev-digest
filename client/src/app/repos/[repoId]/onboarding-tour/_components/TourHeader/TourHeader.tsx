"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRelativeTime } from "@/lib/relative-time";
import { Badge, Button } from "@devdigest/ui";
import type { OnboardingTourGenerateRequest, OnboardingTourResponse, TourRankingMode } from "@devdigest/shared";
import { DEFAULT_WINDOW_DAYS, parseWindowDays, RankingToggle } from "../RankingToggle";
import { SETTINGS_MODELS_HREF } from "../../constants";
import { freshnessState, hasFailedRegeneration, isModelNotConfigured, modelHintLabel, statusBadgeKey } from "./helpers";
import { s } from "./styles";

/**
 * Page header: title, status badge, "~N files", age, ranking label, Stale /
 * "No index yet", and the Generate button. Slice 3 adds the model hint and
 * failure notices; the ranking toggle sits next to Generate (slice 4).
 */
export function TourHeader({
  repoName,
  data,
  lastIndexedSha,
  generating,
  onGenerate,
}: {
  repoName: string;
  data: OnboardingTourResponse;
  /** Repo's current index SHA; undefined while unknown, "" when never indexed. */
  lastIndexedSha: string | undefined;
  generating: boolean;
  onGenerate: (req: OnboardingTourGenerateRequest) => void;
}) {
  const t = useTranslations("onboarding");
  const [mode, setMode] = React.useState<TourRankingMode>("import_graph");
  const [days, setDays] = React.useState(String(DEFAULT_WINDOW_DAYS));
  const activityMode = mode === "activity" && data.can_use_activity;
  const windowDays = parseWindowDays(days);
  const relativeTime = useRelativeTime();
  const meta = data.tour.meta;
  const key = statusBadgeKey(meta);
  const freshness = freshnessState(data.stale, lastIndexedSha);
  const generatedAt = meta?.generated_at;
  const hint = modelHintLabel(data.model_hint);
  const failed = hasFailedRegeneration(data.stored, meta);
  const ranking =
    meta?.ranking_mode === "activity"
      ? t("tour.meta.rankedActivity", { days: meta.window_days ?? "" })
      : t("tour.meta.rankedImport");

  return (
    <div style={s.header}>
      <div>
        <h1 style={s.h1}>
          {t("tour.heading", { repo: repoName })}
        </h1>
        <p style={s.meta}>
          <span>{t("tour.meta.files", { count: data.file_count })}</span>
          <span style={s.sep} aria-hidden="true">·</span>
          <span>
            {generatedAt
              ? t("tour.meta.generated", { time: relativeTime(generatedAt) })
              : t("tour.meta.notGenerated")}
          </span>
          <span style={s.sep} aria-hidden="true">·</span>
          <span>{ranking}</span>
        </p>
        {meta?.ranking_fallback && (
          <p style={s.fallback} role="status" title={meta.ranking_fallback}>
            {t("tour.ranking.fallback")}
          </p>
        )}
        <div style={s.badges}>
          <Badge icon={key === "writtenBy" ? "Sparkles" : "Layers"}>
            {t(`tour.status.${key}`, { reason: meta?.degraded_reason ?? "", model: meta?.model ?? "" })}
          </Badge>
          {freshness === "stale" && (
            <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
              {t("tour.stale.detail")}
            </Badge>
          )}
          {isModelNotConfigured(meta) && (
            <Link href={SETTINGS_MODELS_HREF} style={s.link}>
              {t("tour.configureModel")}
            </Link>
          )}
          {failed && (
            <Badge icon="AlertTriangle" color="var(--warn)" bg="var(--warn-bg)">
              {meta?.last_error_at
                ? t("tour.regenFailed", { time: relativeTime(meta.last_error_at) })
                : generatedAt
                  ? t("tour.regenFailedOlder", { time: relativeTime(generatedAt) })
                  : t("tour.regenFailedNoTime")}
            </Badge>
          )}
          {freshness === "noIndex" && <Badge icon="Info">{t("tour.noIndex")}</Badge>}
        </div>
      </div>
      <div style={s.actions}>
        <RankingToggle
          mode={activityMode ? "activity" : "import_graph"}
          onModeChange={setMode}
          days={days}
          onDaysChange={setDays}
          canUseActivity={data.can_use_activity}
          disabled={generating}
        />
        <Button
          aria-describedby={hint ? "tour-model-hint" : undefined}
          kind="secondary"
          icon="RefreshCw"
          disabled={generating || (activityMode && windowDays === null)}
          loading={generating}
          onClick={() =>
            onGenerate(activityMode && windowDays !== null ? { mode: "activity", window_days: windowDays } : { mode: "import_graph" })
          }
        >
          {generating ? t("tour.generating") : data.stored ? t("tour.regenerate") : t("tour.generate")}
        </Button>
        {hint && (
          <span id="tour-model-hint" style={s.hint}>
            {t("tour.modelHint", { model: hint })}
          </span>
        )}
      </div>
    </div>
  );
}

export default TourHeader;
