"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import { SafeMarkdown } from "../../../../../../../components/safe-markdown";
import { PrBrief } from "../PrBrief";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null;
  prBody: string | null | undefined;
  intent: PrIntentRecord | null | undefined;
  headSha: string | null | undefined;
  /** Route param — the resync CTA inside BlastRadiusCard needs it. */
  repoId: string;
  /** null until the repo record has loaded; BlastRadiusCard falls back to
   *  plain (non-linking) caller text until it does. */
  repoFullName: string | null;
  /** Deep-links into Files changed at `file` (and `line`). */
  onOpenFile: (file: string, line?: number) => void;
}

// D8 (specs/03-intent-layer.md): the Intent card renders first — "before the
// review results" reads most literally as "the first thing on the PR page",
// and Overview is the default tab.
export function OverviewTab({ prId, prBody, intent, headSha, repoId, repoFullName, onOpenFile }: OverviewTabProps) {
  const t = useTranslations("prReview");
  return (
    <div style={s.stack}>
      <PrBrief
        prId={prId}
        intent={intent}
        headSha={headSha}
        repoId={repoId}
        repoFullName={repoFullName}
        onOpenFile={onOpenFile}
      />

      {prBody && (
        <section style={s.card} aria-label={t("overview.description")}>
          <div style={s.header}>
            <Icon.MessageSquare size={14} style={s.headerIcon} />
            <span style={s.label}>{t("overview.description")}</span>
          </div>
          {/* The PR body is author-controlled markdown: SafeMarkdown skips raw
              HTML and blanks javascript:/data: URLs. */}
          <div style={s.body}>
            <SafeMarkdown>{prBody}</SafeMarkdown>
          </div>
        </section>
      )}
    </div>
  );
}
