"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Drawer, ErrorState, Skeleton } from "@devdigest/ui";
import { usePreviewContextFile } from "@/lib/hooks/core";
import { DEFAULT_KIND, KIND_COLORS } from "../context-doc-list/constants";
import { SafeMarkdown } from "../safe-markdown";
import { s } from "./styles";

export interface ContextDocPreviewProps {
  repoId: string;
  path: string;
  /** `panel` renders inline (Project Context page); `drawer` overlays (tabs). */
  layout: "panel" | "drawer";
  onClose?: () => void;
  /** Extra header control, e.g. the Attached / Attach toggle in a tab drawer. */
  action?: React.ReactNode;
}

/** Rendered-markdown preview of one repo document. Raw HTML is not rendered
 *  and link/image URLs drop `javascript:` / `data:` — see `SafeMarkdown` (UI-5). */
export function ContextDocPreview({ repoId, path, layout, onClose, action }: ContextDocPreviewProps) {
  const t = useTranslations("context");
  const { data: file, isLoading, isError, refetch } = usePreviewContextFile(repoId, path);
  const kind = file?.kind ?? DEFAULT_KIND;
  const c = KIND_COLORS[kind];

  const content = isLoading ? (
    <div style={s.skeletons} aria-busy="true">
      <Skeleton height={16} width="60%" />
      <Skeleton height={14} />
      <Skeleton height={14} />
      <Skeleton height={14} width="80%" />
    </div>
  ) : isError || !file ? (
    <ErrorState body={t("preview.loadError")} onRetry={() => refetch()} />
  ) : (
    <>
      <div style={s.head}>
        <div style={s.titleRow}>
          <span className="mono" style={s.path}>
            {file.path}
          </span>
          <Badge color={c.color} bg={c.bg}>
            {t(`kind.${kind}`)}
          </Badge>
          {file.injection_flagged && (
            <Badge color="var(--crit)" bg="var(--crit-bg)" icon="Shield">
              {t("row.injection")}
            </Badge>
          )}
        </div>
        <div style={s.metaRow}>
          {file.used_by != null && <span>{t("row.usedBy", { count: file.used_by })}</span>}
          {file.tokens != null && <span>{t("row.tokens", { tokens: file.tokens })}</span>}
          {action}
        </div>
      </div>
      {file.injection_flagged && (
        <div role="alert" style={s.alert}>
          <strong>{t("preview.injectionTitle")}</strong>
          <span>{t("preview.injectionBody")}</span>
          {(file.injection_matches ?? []).length > 0 ? (
            <ul style={s.matchList}>
              {(file.injection_matches ?? []).map((m) => (
                <li key={m.pattern} style={s.match}>
                  <span>
                    <code className="mono">{m.pattern}</code> · {t("preview.injectionLine", { line: m.line })}
                  </span>
                  <pre className="mono" style={s.excerpt}>
                    {m.excerpt}
                  </pre>
                </li>
              ))}
            </ul>
          ) : (
            (file.injection_patterns ?? []).length > 0 && (
              <span>
                {t("preview.injectionPatterns")}{" "}
                <code className="mono">{(file.injection_patterns ?? []).join(", ")}</code>
              </span>
            )
          )}
        </div>
      )}
      <div style={s.body}>
        <SafeMarkdown>{file.content ?? ""}</SafeMarkdown>
      </div>
    </>
  );

  if (layout === "drawer") {
    return (
      <Drawer width={640} title={t("preview.title")} subtitle={path} onClose={onClose}>
        {content}
      </Drawer>
    );
  }
  return (
    <section style={s.panel} aria-label={t("preview.title")}>
      {content}
    </section>
  );
}
