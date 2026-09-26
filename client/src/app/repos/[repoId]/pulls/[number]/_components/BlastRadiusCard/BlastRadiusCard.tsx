/* BlastRadiusCard — PR Brief's "Blast radius" card (brief.ts's `BlastRadius`):
   which changed symbols are called from where, and which endpoints/crons
   that reaches. Renders after IntentCard on the Overview tab. States:
   loading skeleton, compact error (no toast — client/INSIGHTS.md: query
   failures are already toasted globally), no-symbols empty state, symbols-
   but-no-callers note, and a degraded warn row (best-effort map) with a
   "Rebuild index" CTA for the reasons a resync can actually fix. The map
   itself still renders under the warn row whenever there is data to show. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useBlastRadius, useBlastResync } from "@/lib/hooks";
import { BlastSummary, type BlastView } from "./_components/BlastSummary";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { RESYNCABLE_REASONS } from "./constants";
import { kindsByName, statsFor } from "./helpers";
import { s } from "./styles";

export function BlastRadiusCard({
  prId,
  repoId,
  repoFullName,
  headSha,
}: {
  prId: string | null;
  repoId: string;
  /** null until the repo record loads — threaded down to BlastTree, which
   *  falls back to plain text callers until it (and headSha) are known. */
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  const t = useTranslations("blast");
  const { data: blast, isLoading, isError, refetch: retry } = useBlastRadius(prId);
  const resync = useBlastResync(prId, repoId);
  const [view, setView] = React.useState<BlastView>("tree");

  if (isLoading) {
    return (
      <section style={s.wrap}>
        <div style={s.card}>
          <div style={s.header}>
            <Icon.Zap size={14} style={s.headerIcon} />
            <span style={s.label}>{t("title")}</span>
          </div>
          <Skeleton height={16} width={280} />
          <div style={s.skeletonGap} />
          <Skeleton height={60} />
        </div>
      </section>
    );
  }

  if (isError || !blast) {
    return (
      <section style={s.wrap}>
        <div style={s.card}>
          <div style={s.header}>
            <Icon.Zap size={14} style={s.headerIcon} />
            <span style={s.label}>{t("title")}</span>
          </div>
          <ErrorState title={t("error")} onRetry={() => retry()} />
        </div>
      </section>
    );
  }

  const stats = statsFor(blast);
  const hasSymbols = blast.changed_symbols.length > 0;
  const hasDownstream = blast.downstream.length > 0;
  const canResync = !!blast.reason && RESYNCABLE_REASONS.includes(blast.reason);

  return (
    <section style={s.wrap}>
      <div style={s.card}>
        <div style={s.header}>
          <Icon.Zap size={14} style={s.headerIcon} />
          <span style={s.label}>{t("title")}</span>
        </div>

        {blast.degraded && (
          <div style={s.degradedRow} role="status">
            <Icon.AlertTriangle size={14} style={s.degradedIcon} />
            <div style={s.degradedText}>
              <div>{t(`degraded.${blast.reason ?? "no_data"}`)}</div>
              {canResync && <div style={s.degradedHint}>{t("degradedHint")}</div>}
              {canResync && resync.outcome && (
                <div style={s.degradedHint}>{t(`resyncOutcome.${resync.outcome}`)}</div>
              )}
            </div>
            {canResync && (
              <Button
                kind="secondary"
                size="sm"
                icon="RefreshCw"
                loading={resync.isResyncing}
                onClick={resync.start}
              >
                {t("resync")}
              </Button>
            )}
          </div>
        )}

        {!hasSymbols && !blast.degraded && <EmptyState icon="Code" title={t("empty.noSymbols")} />}

        {hasSymbols && (
          <BlastSummary stats={stats} view={view} onViewChange={setView} showToggle={hasDownstream} />
        )}

        {hasSymbols && !hasDownstream && (
          <div style={s.noDownstream}>{t("noDownstream", { count: stats.symbols })}</div>
        )}

        {hasSymbols && hasDownstream && (
          <>
            {view === "tree" ? (
              <BlastTree
                downstream={blast.downstream}
                kinds={kindsByName(blast)}
                repoFullName={repoFullName}
                headSha={headSha}
              />
            ) : (
              <BlastGraph blast={blast} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
