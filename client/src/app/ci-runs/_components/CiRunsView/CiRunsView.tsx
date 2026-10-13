/* CiRunsView — /ci-runs (AC-45..AC-53, EC-29..EC-32, EC-37). Stored rows only; GitHub is
   reached by Refresh (force) and by the on-open refresh of stale installations. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, SelectInput, Skeleton } from "@devdigest/ui";
import type { CiRunStatus } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useAutoRefreshCi, useCiInstallations, useCiRuns, useRefreshCi } from "@/lib/hooks/ci";
import { CiRunsTable } from "../CiRunsTable";
import { DEFAULT_FILTERS, GENERIC_REASON_KEY, STATUS_FILTERS, STATUS_FILTER_KEY, type CiRunsFilters } from "./constants";
import { agentOptions, hasActiveFilter, refreshFailureKey, repoOptions, toRunsQuery } from "./helpers";
import { s } from "./styles";

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={s.filter}>
      <span style={s.srOnly}>{label}</span>
      {children}
    </label>
  );
}

export function CiRunsView() {
  const t = useTranslations("ci");
  const [filters, setFilters] = React.useState<CiRunsFilters>(DEFAULT_FILTERS);

  const runs = useCiRuns(toRunsQuery(filters));
  const installations = useCiInstallations();
  const auto = useAutoRefreshCi(installations.data);
  const manual = useRefreshCi();

  const filtered = hasActiveFilter(filters);
  const refreshing = manual.isPending || auto.isRefreshing;
  // A manual refresh's outcome replaces an earlier automatic failure.
  const failureKey = manual.isPending
    ? null
    : manual.isIdle
      ? auto.isError
        ? GENERIC_REASON_KEY
        : null
      : refreshFailureKey(manual.error, manual.data);

  const setField = <K extends keyof CiRunsFilters>(key: K, value: CiRunsFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const retry = () => manual.mutate({ force: true });

  const repos = repoOptions(installations.data);
  const agents = agentOptions(installations.data);
  const rows = runs.data ?? [];

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <div style={s.refreshRow}>
            <span role="status" aria-live="polite" style={s.refreshNote}>
              {refreshing ? t("runs.refreshing") : ""}
            </span>
            <Button type="button" kind="secondary" size="sm" icon="RefreshCw" onClick={retry} loading={refreshing} disabled={refreshing}>
              {t("runs.refresh")}
            </Button>
          </div>
        </div>

        {failureKey && (
          <div role="alert" style={s.notice}>
            <span style={s.noticeText}>
              <strong>{t("runs.stale.title")}</strong> {t(`runs.stale.reasons.${failureKey}`)}
            </span>
            <Button type="button" kind="secondary" size="sm" onClick={retry} disabled={refreshing}>
              {t("runs.stale.retry")}
            </Button>
          </div>
        )}

        {(rows.length > 0 || filtered) && (
        <div style={s.filters}>
          <Filter label={t("runs.filters.repo")}>
            <SelectInput
              mono={false}
              value={filters.repo}
              onChange={(v) => setField("repo", v)}
              options={[{ value: "", label: t("runs.filters.allRepos") }, ...repos.map((r) => ({ value: r, label: r }))]}
            />
          </Filter>
          <Filter label={t("runs.filters.agent")}>
            <SelectInput
              mono={false}
              value={filters.agentId}
              onChange={(v) => setField("agentId", v)}
              options={[{ value: "", label: t("runs.filters.allAgents") }, ...agents.map((a) => ({ value: a.id, label: a.name }))]}
            />
          </Filter>
          <Filter label={t("runs.filters.status")}>
            <SelectInput
              mono={false}
              value={filters.status}
              onChange={(v) => setField("status", v as "" | CiRunStatus)}
              options={[
                { value: "", label: t("runs.filters.allStatuses") },
                ...STATUS_FILTERS.map((st) => ({ value: st, label: t(`runs.status.${STATUS_FILTER_KEY[st]}`) })),
              ]}
            />
          </Filter>
        </div>
        )}

        {runs.isLoading && (
          <div role="status" aria-label={t("runs.loading")} style={s.list}>
            <Skeleton height={48} />
            <Skeleton height={48} />
            <Skeleton height={48} />
          </div>
        )}

        {runs.isError && (
          <ErrorState title={t("runs.loadErrorTitle")} body={t("runs.loadErrorBody")} onRetry={() => runs.refetch()} />
        )}

        {runs.data && rows.length === 0 && !filtered && (
          <EmptyState icon="Play" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        )}

        {runs.data && rows.length === 0 && filtered && <p style={s.noMatches}>{t("runs.noMatches")}</p>}

        {rows.length > 0 && <CiRunsTable runs={rows} />}
      </div>
    </AppShell>
  );
}
