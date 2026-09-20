"use client";

import React from "react";
import { useTranslations, useFormatter } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useConventions, useExtractConventions, usePatchConvention } from "@/lib/hooks/conventions";
import { BulkActionsBar } from "./_components/BulkActionsBar";
import { ConventionCard } from "./_components/ConventionCard";
import { CreateSkillFromConventionsModal } from "./_components/CreateSkillFromConventionsModal";
import { RunExtractionDropdown } from "./_components/RunExtractionDropdown";
import { SKELETON_ROWS } from "./constants";
import { acceptedIds, allEligibleAccepted, countAccepted, pendingIds } from "./helpers";
import { s } from "./styles";

/**
 * `/conventions` — run extraction on the active repo, review candidates
 * (accept/reject/edit), and bundle accepted ones into one or more Skills.
 * Repo-scoped the same way Skills/Agents are: a flat route reading the
 * active repo from context rather than a `:repoId` URL param.
 */
export function ConventionsListView() {
  const t = useTranslations("conventions");
  const format = useFormatter();
  const { repoId, activeRepo, reposLoaded } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const patch = usePatchConvention(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const repoName = activeRepo?.full_name ?? t("page.repoFallback");

  if (!reposLoaded) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>
          <Skeleton height={120} />
        </div>
      </AppShell>
    );
  }

  if (repoNotFound || !repoId) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const candidates = data?.candidates ?? [];
  const accepted = countAccepted(candidates);

  const acceptAll = () => {
    pendingIds(candidates).forEach((id) => patch.mutate({ id, patch: { status: "accepted" } }));
  };
  const deselectAll = () => {
    acceptedIds(candidates).forEach((id) => patch.mutate({ id, patch: { status: "pending" } }));
  };

  return (
    <AppShell crumb={crumb}>
      {modalOpen && (
        <CreateSkillFromConventionsModal
          repoId={repoId}
          repoName={repoName}
          candidateIds={acceptedIds(candidates)}
          onClose={() => setModalOpen(false)}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repoName}>{repoName}</span>
            </h1>
            <p style={s.subtitle}>
              {data ? t("page.candidateCount", { count: candidates.length }) : t("page.scanning")}
              {data?.scan
                ? ` · ${t("page.lastScan", { time: format.relativeTime(new Date(data.scan.created_at)) })}`
                : ""}
            </p>
          </div>
          <RunExtractionDropdown loading={extract.isPending} onRun={(mode) => extract.mutate(mode)} />
        </div>

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} height={120} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon="FileText"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => extract.mutate("both")}
            ctaLoading={extract.isPending}
          />
        ) : (
          <>
            <BulkActionsBar
              acceptedCount={accepted}
              totalCount={candidates.length}
              allAccepted={allEligibleAccepted(candidates)}
              onAcceptAll={acceptAll}
              onDeselectAll={deselectAll}
              onCreateSkill={() => setModalOpen(true)}
              busy={patch.isPending}
            />
            <div style={s.list}>
              {candidates.map((c) => (
                <ConventionCard
                  key={c.id}
                  candidate={c}
                  onSetStatus={(status) => patch.mutate({ id: c.id, patch: { status } })}
                  onSave={(p) => patch.mutate({ id: c.id, patch: p })}
                  busy={patch.isPending}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
