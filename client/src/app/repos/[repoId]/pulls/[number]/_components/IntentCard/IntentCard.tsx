/* IntentCard — specs/03-intent-layer.md §9. Renders the PR's declared intent
   & scope (D8: top of the Overview tab, before anything else) with a re-run
   affordance and a staleness banner. Renders an honest empty state — never a
   fabricated placeholder — when the PR hasn't been classified yet. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Button, EmptyState, Icon } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { useClassifyIntent } from "../../../../../../../lib/hooks/intent";
import { CONFIDENCE_META } from "./constants";
import { isIntentStale, unresolvedSources } from "./helpers";
import { s } from "./styles";

export function IntentCard({
  prId,
  intent,
  headSha,
}: {
  prId: string | null;
  intent: PrIntentRecord | null | undefined;
  headSha?: string | null;
}) {
  const t = useTranslations("intent");
  const classify = useClassifyIntent(prId);

  if (!intent) {
    return (
      <section style={s.wrap}>
        <EmptyState
          icon="Target"
          title={t("empty.title")}
          body={t("empty.body")}
          cta={t("empty.cta")}
          onCta={() => classify.mutate()}
          ctaLoading={classify.isPending}
        />
      </section>
    );
  }

  const meta = CONFIDENCE_META[intent.confidence];
  const warnings = unresolvedSources(intent.sources);
  const stale = isIntentStale(intent.classified_for_sha, headSha);

  return (
    <section style={s.wrap}>
      <SectionLabel
        icon="Target"
        right={
          <div style={s.headerActions}>
            {stale && (
              <Badge color="var(--warn)" bg="var(--warn-bg)" icon="Clock">
                {t("stale")}
              </Badge>
            )}
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={classify.isPending}
              onClick={() => classify.mutate()}
            >
              {classify.isPending ? t("rerunning") : t("rerun")}
            </Button>
          </div>
        }
      >
        {t("title")}
      </SectionLabel>

      <div style={s.card}>
        <div style={s.summaryRow}>
          <Badge color={meta.c} bg={meta.bg} icon={meta.icon}>
            {t(`confidence.${meta.labelKey}`)}
          </Badge>
        </div>
        <p style={s.summary}>{intent.intent}</p>

        <div style={s.lists}>
          <div style={s.listCol}>
            <div style={s.listLabel}>{t("inScope")}</div>
            <ul style={s.list}>
              {intent.in_scope.map((item, i) => (
                <li key={i} style={s.listItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div style={s.listCol}>
            <div style={s.listLabel}>{t("outOfScope")}</div>
            <ul style={s.list}>
              {intent.out_of_scope.map((item, i) => (
                <li key={i} style={s.listItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {warnings.length > 0 && (
          <div style={s.warnings}>
            {warnings.map((source, i) => (
              <div key={i} style={s.warningRow}>
                <Icon.AlertTriangle size={14} style={s.warningIcon} />
                <span>
                  {t(`sourceWarning.${source.status === "missing" ? "missing" : "unreachable"}`, {
                    source: t(`source.${source.kind}`),
                  })}
                  {source.note ? ` (${source.note})` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
