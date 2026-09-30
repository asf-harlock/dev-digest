/* PrBrief — the Overview's "PR Brief" section (specs/06-pr-brief.md): summary,
   the Intent card next to the Blast radius card, then the Risk areas card next
   to the Review focus list (file ref above its reason). Generation is explicit (Generate brief) and
   never runs on load (NFR-11). All model output renders as plain text. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Skeleton } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { formatFileRef } from "../../../../../../../lib/file-ref";
import { useBriefGeneration } from "../../../../../../../lib/hooks/brief";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { RiskAreas } from "../RiskAreas";
import { shortSha } from "./helpers";
import { s } from "./styles";

export function PrBrief({
  prId,
  intent,
  headSha,
  repoId,
  repoFullName,
  onOpenFile,
}: {
  prId: string | null;
  intent: PrIntentRecord | null | undefined;
  headSha: string | null | undefined;
  repoId: string;
  repoFullName: string | null;
  onOpenFile: (file: string, line?: number) => void;
}) {
  const t = useTranslations("brief");
  const { query, start, outcome, isGenerating } = useBriefGeneration(prId);
  const data = query.data;
  const brief = data?.brief ?? null;
  const meta = data?.meta ?? null;
  const lastError = meta?.last_error ?? null;
  const missing = data?.missing_inputs ?? [];
  const sha = shortSha(meta?.generated_for_sha);

  const errorText =
    outcome === "config_error"
      ? t("error.configError")
      : outcome === "timeout"
        ? t("error.timeout")
        : outcome === "poll_failed"
          ? t("error.pollFailed")
          : lastError
            ? lastError.trim()
              ? t("error.failed", { message: lastError })
              : t("error.failedGeneric")
            : null;

  return (
    <section style={s.wrap} aria-label={t("title")}>
      <div style={s.card}>
        <div style={s.header}>
          <Icon.Sparkles size={14} style={{ color: "var(--text-muted)" }} />
          <span style={s.label}>{t("title")}</span>
          <div style={s.headerActions}>
            {brief ? (
              <Button
                kind="tertiary"
                size="sm"
                icon="RefreshCw"
                loading={isGenerating}
                disabled={isGenerating}
                onClick={start}
                aria-label={t("regenerate")}
                title={t("regenerate")}
              />
            ) : (
              <Button kind="primary" size="sm" icon="Sparkles" loading={isGenerating} disabled={isGenerating || !prId} onClick={start}>
                {t("generate")}
              </Button>
            )}
          </div>
        </div>

        <div role="status" aria-live="polite">
          {isGenerating && <span style={s.srOnly}>{t("generating")}</span>}
        </div>

        {isGenerating ? (
          <div style={s.skeletonStack} data-testid="brief-skeleton">
            <Skeleton height={16} width={420} />
            <Skeleton height={16} />
            <Skeleton height={16} width={300} />
          </div>
        ) : brief ? (
          <p style={s.summary}>{brief.summary}</p>
        ) : (
          <>
            <p style={s.emptyTitle}>{t("empty.title")}</p>
            <p style={s.muted}>{t("empty.body")}</p>
          </>
        )}

        {data?.stale && brief && !isGenerating && (
          <div style={s.note("var(--warn)")}>
            <Icon.Clock size={13} style={s.noteIcon} />
            <span>{sha ? t("staleNote", { sha }) : t("staleNoSha")}</span>
          </div>
        )}

        {errorText && !isGenerating && (
          <div style={s.note("var(--crit)")} role="alert">
            <Icon.AlertTriangle size={13} style={s.noteIcon} />
            <span>
              {errorText}
              {outcome === "config_error" && (
                <Link href="/settings/models" style={s.link}>
                  {t("error.settingsLink")}
                </Link>
              )}
              {outcome !== "config_error" && (
                <Button kind="ghost" size="sm" onClick={start} disabled={isGenerating}>
                  {t("retry")}
                </Button>
              )}
            </span>
          </div>
        )}

        {brief && !isGenerating && missing.length > 0 && (
          <div style={s.note("var(--warn)")}>
            <Icon.AlertTriangle size={13} style={s.noteIcon} />
            <div>
              {t("missingTitle")}
              <ul style={s.missingList}>
                {missing.map((m, i) => (
                  <li key={i}>{t(`missing.${m.kind}`)}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* D5: spec documents live in Project Context; the brief reads the ones
            attached to enabled agents/skills — there is no per-brief picker,
            so say where they come from and where to attach them. */}
        {!isGenerating && (
          <div style={s.hint}>
            <Icon.Info size={13} style={s.noteIcon} />
            <div>
              <span style={s.hintTitle}>{t("contextHint.title")}</span> {t("contextHint.body")}
              <div style={s.hintLinks}>
                <Link href={`/repos/${encodeURIComponent(repoId)}/context`} style={s.hintLink}>
                  {t("contextHint.projectContext")}
                </Link>
                <Link href="/agents" style={s.hintLink}>
                  {t("contextHint.agents")}
                </Link>
                <Link href="/skills" style={s.hintLink}>
                  {t("contextHint.skills")}
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={s.twoCol}>
        <IntentCard prId={prId} intent={intent} headSha={headSha} />
        <BlastRadiusCard prId={prId} repoId={repoId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      {(isGenerating || brief) && (
        <div style={s.twoCol}>
          <RiskAreas risks={brief?.risks ?? []} loading={isGenerating} onOpenFile={onOpenFile} />

          <section style={s.card} aria-label={t("reviewFocus")}>
            <div style={s.header}>
              <Icon.Target size={14} style={{ color: "var(--text-muted)" }} />
              <span style={s.label}>{t("reviewFocus")}</span>
              {brief && !isGenerating && <Badge>{brief.review_focus.length}</Badge>}
            </div>
            {isGenerating || !brief ? (
              <Skeleton height={60} />
            ) : brief.review_focus.length === 0 ? (
              <p style={s.muted}>{t("noFocus")}</p>
            ) : (
              <ul style={s.focusList}>
                {brief.review_focus.map((item, i) => (
                  <li key={i}>
                    <button type="button" style={s.focusRow} onClick={() => onOpenFile(item.file, item.line)}>
                      <span className="mono" style={s.focusRef}>
                        {formatFileRef(item.file, item.line)}
                      </span>
                      <span style={s.focusReason}>{item.reason}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
