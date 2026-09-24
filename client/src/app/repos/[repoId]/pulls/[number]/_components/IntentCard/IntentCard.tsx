/* IntentCard — specs/03-intent-layer.md §9. Renders the PR's declared intent
   & scope (D8: top of the Overview tab, before anything else) in the PR Brief
   design's "Intent" card: label inside the card, the intent as an italic
   quote, ✓ In scope / ✕ Out of scope columns, and — only when risks are
   supplied (PR Brief, a later lesson) — a Risk areas row. Confidence, the
   staleness badge and re-run stay as compact header controls, and any
   missing/unreachable source is still shown as an honest note (D4). Renders
   an empty state — never a fabricated placeholder — when the PR hasn't been
   classified yet. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, Icon } from "@devdigest/ui";
import type { PrIntentRecord, Risk } from "@devdigest/shared";
import { useClassifyIntent } from "../../../../../../../lib/hooks/intent";
import { CONFIDENCE_META, RISK_META, SCOPE_META } from "./constants";
import { isIntentStale, unresolvedSources } from "./helpers";
import { s } from "./styles";

export function IntentCard({
  prId,
  intent,
  headSha,
  risks,
}: {
  prId: string | null;
  intent: PrIntentRecord | null | undefined;
  headSha?: string | null;
  /** Risk areas from the PR Brief; the section is hidden when absent/empty. */
  risks?: Risk[];
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
  const notes = unresolvedSources(intent.sources);
  const stale = isIntentStale(intent.classified_for_sha, headSha);
  const riskList = risks ?? [];

  return (
    <section style={s.wrap}>
      <div style={s.card}>
        <div style={s.header}>
          <Icon.Target size={14} style={s.headerIcon} />
          <span style={s.label}>{t("title")}</span>
          <div style={s.headerActions}>
            <Badge color={meta.c} bg={meta.bg} icon={meta.icon}>
              {t(`confidence.${meta.labelKey}`)}
            </Badge>
            {stale && (
              <Badge color="var(--warn)" bg="var(--warn-bg)" icon="Clock">
                {t("stale")}
              </Badge>
            )}
            <Button
              kind="tertiary"
              size="sm"
              icon="RefreshCw"
              loading={classify.isPending}
              onClick={() => classify.mutate()}
              aria-label={classify.isPending ? t("rerunning") : t("rerun")}
              title={t("rerun")}
            />
          </div>
        </div>

        <p style={s.quote}>“{intent.intent}”</p>

        <div style={s.lists}>
          <ScopeColumn kind="in" label={t("inScope")} items={intent.in_scope} empty={t("scopeEmpty")} />
          <ScopeColumn kind="out" label={t("outOfScope")} items={intent.out_of_scope} empty={t("scopeEmpty")} />
        </div>

        {riskList.length > 0 && (
          <div style={s.divider}>
            <div style={s.listLabel("var(--text-muted)")}>
              <Icon.AlertTriangle size={13} />
              {t("riskAreas")}
            </div>
            <div style={s.chips}>
              {riskList.map((risk, i) => {
                const rm = RISK_META[risk.severity];
                const RiskIcon = Icon[rm.icon];
                return (
                  <span key={i} style={s.chip} title={risk.explanation}>
                    <RiskIcon size={14} style={{ color: rm.c }} />
                    {risk.title}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {notes.length > 0 && (
          <div style={{ ...s.divider, ...s.notes }}>
            {notes.map((source, i) => (
              <div key={i} style={s.noteRow}>
                <Icon.AlertTriangle size={13} style={s.noteIcon} />
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

function ScopeColumn({
  kind,
  label,
  items,
  empty,
}: {
  kind: "in" | "out";
  label: string;
  items: string[];
  empty: string;
}) {
  const m = SCOPE_META[kind];
  const HeaderIcon = Icon[m.icon];
  return (
    <div style={s.listCol}>
      <div style={s.listLabel(m.header)}>
        <HeaderIcon size={13} />
        {label}
      </div>
      {items.length === 0 && <div style={s.listItem("var(--text-muted)")}>{empty}</div>}
      <ul style={s.list}>
        {items.map((item, i) => (
          <li key={i} style={s.listItem(m.item)}>
            <span style={s.bullet(m.bullet)} aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
