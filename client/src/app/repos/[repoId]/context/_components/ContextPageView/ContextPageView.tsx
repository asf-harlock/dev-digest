"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { ContextDocList } from "@/components/context-doc-list";
import { ContextDocPreview } from "@/components/context-doc-preview";
import { RepoNotFound } from "@/components/repo-not-found";
import { useContextFiles, useRescanContext } from "@/lib/hooks/core";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { s } from "./styles";

/**
 * `/repos/:repoId/context` — read-only browser for the repo's spec documents:
 * list + rendered preview with "Used by N agents", Rescan, and a footer with
 * the file count and last scan time. No create / upload / folder / Edit
 * controls (AC-7): documents are changed in git, then Rescan picks them up.
 */
export function ContextPageView() {
  const t = useTranslations("context");
  const format = useFormatter();
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const listing = useContextFiles(repoId);
  const rescan = useRescanContext();
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const data = listing.data;
  const files = data?.files ?? [];
  const total = data?.total ?? files.length;
  const warning = rescan.isSuccess ? rescan.data.warning : data?.warning;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.h1}>
              {t("title")}
              <span style={s.repoName}> · {repoName}</span>
            </h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <Button
            kind="secondary"
            icon="RefreshCw"
            disabled={rescan.isPending}
            loading={rescan.isPending}
            onClick={() => rescan.mutate(repoId)}
          >
            {rescan.isPending ? t("rescan.running") : t("rescan.label")}
          </Button>
        </div>

        {warning && (
          <div style={s.notice} role="status">
            <Icon.AlertTriangle size={14} />
            <span>{t(`rescan.warning.${warning}`)}</span>
          </div>
        )}

        <div style={previewPath ? s.body : s.bodySingle}>
          <ContextDocList
            files={files}
            total={total}
            isLoading={listing.isLoading}
            isError={listing.isError}
            onRetry={() => listing.refetch()}
            notCloned={data?.state === "not_cloned"}
            onPreview={setPreviewPath}
            previewPath={previewPath}
          />
          {previewPath && (
            <ContextDocPreview key={previewPath} repoId={repoId} path={previewPath} layout="panel" />
          )}
        </div>
        {!previewPath && files.length > 0 && <div style={s.selectHint}>{t("preview.select")}</div>}

        <div style={s.footer}>
          {listing.isLoading ? (
            <Skeleton height={14} width={220} />
          ) : data ? (
            <>
              <span>{t("footer.files", { count: files.length })}</span>
              {total > files.length && <span>{t("footer.showing", { shown: files.length, total })}</span>}
              <span>{t("footer.lastScan", { time: format.relativeTime(new Date(data.scanned_at)) })}</span>
            </>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}
