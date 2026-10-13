/* ResultsView — /repos/:repoId/multi-agent/:number. The latest grouped run of one PR:
   header (agents · parallel · total time · cost), Columns / Tabs, "Where agents disagree".
   Status is polled by useMultiAgentRun (4 s while a column runs); an aria-live region announces
   changes. "View trace" opens the EXISTING RunTraceDrawer for a column of the shown run
   (`?trace=<run_id>`, `key={runId}`, `running` for a running column) — the page has no SSE of its own. */
"use client";

import React from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { usePulls } from "@/lib/hooks/core";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { EM_DASH, formatCostUsd, formatDuration } from "@/lib/eval-format";
import { ColumnsView } from "../ColumnsView";
import { TabsView } from "../TabsView";
import { DisagreementBlock } from "../DisagreementBlock";
import { ViewSwitch, parseView, type ViewMode } from "../ViewSwitch";
import { PARAM_TRACE, PARAM_VIEW } from "./constants";
import { statusChanges, statusMap, traceColumn, withParams } from "./helpers";
import { s } from "./styles";

export function ResultsView() {
  const t = useTranslations("runs");
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  // The route is keyed by PR number; every PR API is keyed by the row's uuid.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const pr = pulls?.find((p) => p.number === Number(number)) ?? null;
  const prId = pr?.id ?? null;
  const { data: run, isLoading: runLoading, isError, refetch, pollExpired, refresh } = useMultiAgentRun(prId);

  const view = parseView(search.get(PARAM_VIEW));
  const traceId = search.get(PARAM_TRACE);
  const setParams = (changes: Record<string, string | null>) =>
    router.replace(withParams(pathname, search, changes));

  // aria-live: announce a column's status change (not the first render).
  const seen = React.useRef<{ runId: string; statuses: Map<string, string> } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  React.useEffect(() => {
    if (!run) return;
    const prev = seen.current;
    if (prev && prev.runId === run.id) {
      const changed = statusChanges(prev.statuses, run.columns);
      if (changed.length > 0) {
        setAnnouncement(
          changed
            .map((c) =>
              t("page.announce", { agent: c.agent_name ?? t("deletedAgent"), status: t(`status.${c.status}`) }),
            )
            .join(". "),
        );
      }
    }
    seen.current = { runId: run.id, statuses: statusMap(run.columns) };
  }, [run, t]);

  const repoName = activeRepo?.full_name ?? repoId;
  const configureHref = `/repos/${repoId}/multi-agent`;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("page.crumb"), href: configureHref },
    { label: `#${number}`, mono: true },
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (pullsLoading || (prId != null && runLoading)) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.skeleton} aria-busy="true" aria-label={t("page.loading")}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={260} />
        </div>
      </AppShell>
    );
  }

  if (!pr || !prId) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState icon="GitPullRequest" title={t("page.noPr.title")} body={t("page.noPr.body", { number })} />
      </AppShell>
    );
  }

  // A failed poll with nothing cached: full error. With a snapshot, a banner above it (EC-14).
  if (isError && !run) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("page.error.title")} body={t("page.error.body")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  // 404 = no grouped run yet (EC-16).
  if (!run) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="Users"
          title={t("page.noRun.title")}
          body={t("page.noRun.body")}
          cta={t("page.noRun.cta")}
          onCta={() => router.push(configureHref)}
        />
      </AppShell>
    );
  }

  const trace = traceColumn(run, traceId);

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.titleRow}>
          <div style={s.titleLeft}>
            <Button type="button" kind="secondary" size="sm" icon="Settings" onClick={() => router.push(configureHref)}>
              {t("page.configure")}
            </Button>
            <h1 style={s.h1}>{t("page.title")}</h1>
            <span style={s.subtitle}>{t("page.subtitle", { count: run.agent_count })}</span>
          </div>
          <ViewSwitch
            value={view}
            onChange={(v: ViewMode) => setParams({ [PARAM_VIEW]: v === "columns" ? null : v })}
          />
        </div>

        <div style={s.prRow}>
          <div style={s.pr}>
            <span className="mono" style={s.prNumber}>
              #{pr.number}
            </span>
            <span style={s.prTitle}>{pr.title}</span>
          </div>
          <span style={s.meta}>
            <Icon.Cpu size={15} />
            {t("page.meta", {
              count: run.agent_count,
              duration: formatDuration(run.total_duration_ms),
              cost: run.total_cost_usd == null ? EM_DASH : formatCostUsd(run.total_cost_usd),
            })}
          </span>
        </div>

        <div role="status" aria-live="polite" style={s.live}>
          {announcement}
        </div>

        {isError && (
          <div role="alert" style={s.banner}>
            <span>
              <span style={s.bannerTitle}>{t("page.error.title")}.</span> {t("page.error.body")}
            </span>
            <Button type="button" kind="secondary" size="sm" icon="RefreshCw" onClick={() => refetch()}>
              {t("page.error.retry")}
            </Button>
          </div>
        )}
        {pollExpired && (
          <div role="alert" style={s.banner}>
            <span>
              <span style={s.bannerTitle}>{t("page.stale.title")}.</span> {t("page.stale.body")}
            </span>
            <Button type="button" kind="secondary" size="sm" icon="RefreshCw" onClick={refresh}>
              {t("page.stale.refresh")}
            </Button>
          </div>
        )}

        {view === "tabs" ? (
          <TabsView
            columns={run.columns}
            prId={prId}
            repoFullName={activeRepo?.full_name ?? null}
            headSha={pr.head_sha}
            onOpenTrace={(id) => setParams({ [PARAM_TRACE]: id })}
          />
        ) : (
          <ColumnsView columns={run.columns} onOpenTrace={(id) => setParams({ [PARAM_TRACE]: id })} />
        )}

        <DisagreementBlock conflicts={run.conflicts} columns={run.columns} />
      </div>

      {trace && (
        <RunTraceDrawer
          key={trace.run_id}
          runId={trace.run_id}
          agentName={trace.agent_name ?? t("deletedAgent")}
          prNumber={run.pr_number ?? pr.number}
          findings={trace.findings}
          running={trace.status === "running"}
          onClose={() => setParams({ [PARAM_TRACE]: null })}
        />
      )}
    </AppShell>
  );
}
