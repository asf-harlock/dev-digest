"use client";

import React from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { OnboardingTourResponse } from "@devdigest/shared";
import { SETTINGS_MODELS_HREF } from "../../constants";
import { freshnessState, hasFailedRegeneration, isModelNotConfigured, modelHintLabel, statusBadgeKey } from "./helpers";
import { s } from "./styles";

/**
 * Page header: title, status badge, "~N files", age, ranking label, Stale /
 * "No index yet", and the Generate button. Slice 3 adds the model hint and
 * failure notices; slice 4 adds the ranking toggle next to Generate.
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
  onGenerate: () => void;
}) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
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
              ? t("tour.meta.generated", { time: format.relativeTime(new Date(generatedAt)) })
              : t("tour.meta.notGenerated")}
          </span>
          <span style={s.sep} aria-hidden="true">·</span>
          <span>{ranking}</span>
        </p>
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
                ? t("tour.regenFailed", { time: format.relativeTime(new Date(meta.last_error_at)) })
                : generatedAt
                  ? t("tour.regenFailedOlder", { time: format.relativeTime(new Date(generatedAt)) })
                  : t("tour.regenFailedNoTime")}
            </Badge>
          )}
          {freshness === "noIndex" && <Badge icon="Info">{t("tour.noIndex")}</Badge>}
        </div>
      </div>
      <div style={s.actions}>
        <Button
          aria-describedby={hint ? "tour-model-hint" : undefined}
          kind="secondary"
          icon="RefreshCw"
          disabled={generating}
          loading={generating}
          onClick={onGenerate}
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
