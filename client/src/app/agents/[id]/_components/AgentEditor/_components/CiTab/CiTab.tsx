"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, CiFailOn, CiInstallation } from "@devdigest/shared";
import { useAgentCiInstallations, useAutoRefreshCi, useRefreshCi } from "@/lib/hooks/ci";
import { useUpdateAgent } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { ExportWizard } from "../../../ExportWizard";
import { FailOnControl } from "./_components/FailOnControl";
import { InstallationRow } from "./_components/InstallationRow";
import { RunHistory } from "./_components/RunHistory";
import { NO_INSTALLATIONS } from "./constants";
import { ADD_REPOSITORY_INITIAL, countActive, updateInitial, updateTarget, type WizardInitial } from "./helpers";
import { s } from "./styles";

/** CI tab — where the agent runs in CI, the latest runs per repository and the Fail CI on policy (SPEC-11, US-3). */
export function CiTab({ agent }: { agent: Agent }) {
  const t = useTranslations("ci");
  const toast = useToast();
  const update = useUpdateAgent();
  const { data, isLoading, isError, refetch } = useAgentCiInstallations(agent.id);
  const installations: readonly CiInstallation[] = data ?? NO_INSTALLATIONS;
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // `session` re-keys the wizard so every opening starts from a clean state.
  const [wizard, setWizard] = React.useState<{ session: number; initial?: WizardInitial } | null>(null);

  // Opening the tab refreshes installations that are stale or never refreshed (AC-53).
  const auto = useAutoRefreshCi(installations);
  const retryRefresh = useRefreshCi();
  // EC-31: a failed or timed-out refresh keeps the stored rows and offers a Retry.
  const stale = auto.isError && !retryRefresh.isSuccess;

  const selected = installations.find((i) => i.id === selectedId) ?? null;
  const target = updateTarget(installations, selectedId);
  const openWizard = (initial?: WizardInitial) => setWizard((w) => ({ session: (w?.session ?? 0) + 1, initial }));
  const closeWizard = () => setWizard(null);

  // Show the segment being saved right away instead of waiting for the round trip.
  const pending = update.isPending ? update.variables?.patch.ci_fail_on : undefined;
  const failOn: CiFailOn = pending ?? agent.ci_fail_on;
  const saveFailOn = (next: CiFailOn) =>
    update.mutate(
      { id: agent.id, patch: { ci_fail_on: next } },
      {
        onSuccess: () => {
          toast.success(t("ciTab.failOn.saved"));
          // `ci_fail_on` is part of the manifest, so the agent version moves and `update_available` changes.
          void refetch();
        },
      },
    );

  const wizardNode = (
    <ExportWizard
      key={wizard?.session ?? 0}
      agent={agent}
      open={wizard !== null}
      onClose={closeWizard}
      initial={wizard?.initial}
    />
  );

  if (isLoading) {
    return (
      <div style={s.wrap} aria-busy="true">
        <Skeleton height={32} width={260} />
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }
  if (isError) {
    return (
      <ErrorState title={t("ciTab.loadErrorTitle")} body={t("ciTab.loadErrorBody")} onRetry={() => refetch()} />
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("ciTab.heading")}</h2>
        <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
          {t("ciTab.activeBadge", { count: countActive(installations) })}
        </Badge>
        <div style={s.spacer} />
        <div style={s.actions}>
          {target && (
            <Button
              type="button"
              kind="secondary"
              icon="RefreshCw"
              title={t("ciTab.updateConfigHint", { repo: target.repo })}
              onClick={() => openWizard(updateInitial(target))}
            >
              {t("ciTab.updateConfig")}
            </Button>
          )}
          <Button type="button" kind="primary" icon="Plus" onClick={() => openWizard()}>
            {t("ciTab.addToCi")}
          </Button>
        </div>
      </div>

      {stale && (
        <div role="status" style={s.stale}>
          <Icon.AlertTriangle size={14} />
          <span>{t("ciTab.staleNotice")}</span>
          <Button
            type="button"
            kind="ghost"
            size="sm"
            loading={retryRefresh.isPending}
            onClick={() => retryRefresh.mutate({ force: true })}
          >
            {t("ciTab.retry")}
          </Button>
        </div>
      )}

      <FailOnControl value={failOn} onChange={saveFailOn} disabled={update.isPending} />

      {installations.length === 0 ? (
        <EmptyState icon="Workflow" title={t("ciTab.emptyTitle")} body={t("ciTab.emptyBody")} />
      ) : (
        <>
          <ul style={s.list} aria-label={t("ciTab.installationsLabel")}>
            {installations.map((inst) => (
              <li key={inst.id}>
                <InstallationRow
                  installation={inst}
                  selected={inst.id === selectedId}
                  onSelect={() => setSelectedId(inst.id === selectedId ? null : inst.id)}
                />
              </li>
            ))}
          </ul>
          <button type="button" style={s.addRepo} onClick={() => openWizard(ADD_REPOSITORY_INITIAL)}>
            <Icon.Plus size={16} />
            {t("ciTab.addRepository")}
          </button>
          {selected ? (
            <RunHistory key={selected.id} installation={selected} />
          ) : (
            <p style={s.hint}>{t("ciTab.history.selectHint")}</p>
          )}
        </>
      )}
      {wizardNode}
    </div>
  );
}
