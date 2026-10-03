"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { TourSection as TourSectionData } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useOnboardingTour } from "@/lib/hooks/onboarding-tour";
import { useRepoIntelStatus } from "@/lib/hooks/repo-intel";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { SECTION_DEFS } from "../../constants";
import { TourHeader } from "../TourHeader";
import { TourSection } from "../TourSection";
import { OnThisPage } from "../OnThisPage";
import { ArchitectureSection } from "../ArchitectureSection";
import { CriticalPathsSection } from "../CriticalPathsSection";
import { RunLocallySection } from "../RunLocallySection";
import { ReadingPathSection } from "../ReadingPathSection";
import { FirstTasksSection } from "../FirstTasksSection";
import { s } from "./styles";

/**
 * `/repos/:repoId/onboarding-tour` — the five tour sections (skeleton or
 * stored), the header with status/stale/generate, and the "On this page"
 * menu. Collapse state lives here so the menu can expand a collapsed target
 * before scrolling to it (AC-13).
 */
export function TourPage() {
  const t = useTranslations("onboarding");
  const { repoId } = useParams<{ repoId: string }>();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const tour = useOnboardingTour(repoId);
  const intel = useRepoIntelStatus(repoId);
  const [collapsed, setCollapsed] = React.useState<ReadonlySet<string>>(new Set());

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("title") }];

  const toggle = React.useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const expand = React.useCallback((id: string) => {
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  const tocItems = React.useMemo(
    () => SECTION_DEFS.map((d) => ({ id: d.id, label: t(`tour.sections.${d.titleKey}`) })),
    [t],
  );

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const data = tour.query.data;
  if (!data) {
    return (
      <AppShell crumb={crumb}>
        {tour.query.isError ? (
          <ErrorState title={t("loadError.title")} onRetry={() => tour.query.refetch()} />
        ) : (
          <div style={s.skeletonBlock} aria-busy="true">
            <Skeleton height={28} width={320} />
            <Skeleton height={14} width={420} />
            <Skeleton height={160} />
          </div>
        )}
      </AppShell>
    );
  }

  const meta = data.tour.meta;
  const byKind = (kind: TourSectionData["kind"]) => data.tour.sections.find((x) => x.kind === kind);
  const sectionBody = (kind: TourSectionData["kind"]): React.ReactNode => {
    const sec = byKind(kind);
    switch (kind) {
      case "architecture":
        return <ArchitectureSection section={sec?.kind === "architecture" ? sec : undefined} />;
      case "critical_paths":
        return (
          <CriticalPathsSection
            section={sec?.kind === "critical_paths" ? sec : undefined}
            repoFullName={activeRepo?.full_name}
            sha={meta?.index_sha || activeRepo?.default_branch}
            activityRanked={meta?.ranking_mode === "activity"}
          />
        );
      case "run_locally":
        return <RunLocallySection section={sec?.kind === "run_locally" ? sec : undefined} />;
      case "reading_path":
        return (
          <ReadingPathSection
            section={sec?.kind === "reading_path" ? sec : undefined}
            activityRanked={meta?.ranking_mode === "activity"}
            repoFullName={activeRepo?.full_name}
            sha={meta?.index_sha || activeRepo?.default_branch}
          />
        );
      case "first_tasks":
        return <FirstTasksSection section={sec?.kind === "first_tasks" ? sec : undefined} />;
    }
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <TourHeader
          repoName={repoName}
          data={data}
          lastIndexedSha={intel.data ? intel.data.lastIndexedSha : undefined}
          generating={tour.generating || tour.isStarting}
          onGenerate={(req) => tour.generate(req)}
        />

        {(tour.timedOut || tour.pollFailed) && (
          <div style={s.notice} role="status">
            <span>{tour.timedOut ? t("tour.timedOut") : t("tour.pollFailed")}</span>
            <Button kind="secondary" size="sm" onClick={() => tour.generate()}>
              {t("tour.retry")}
            </Button>
          </div>
        )}

        <div style={s.layout}>
          <OnThisPage
            items={tocItems}
            onExpand={expand}
          />
          <div style={s.content}>
            {SECTION_DEFS.map((d) => (
              <TourSection
                key={d.id}
                id={d.id}
                title={t(`tour.sections.${d.titleKey}`)}
                icon={d.icon}
                open={!collapsed.has(d.id)}
                onToggle={() => toggle(d.id)}
              >
                {sectionBody(d.kind)}
              </TourSection>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default TourPage;
