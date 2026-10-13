/* ConfigureRunView — /repos/:repoId/multi-agent (SPEC-11 AC-9…AC-12, EC-1, EC-5, EC-8, EC-9, EC-25).
   Step 1 picks a pull request of the repo, step 2 the agents (enabled ones start checked); the
   estimate shows the longest agent and the summed known costs, "parallel". Starting posts ONE
   grouped run and opens the results page. PR titles and agent text render as escaped text. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { AgentEstimate, EstimateSummary, aggregateEstimates, indexEstimates } from "@/components/agent-estimate";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { useMultiAgentEstimates, useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { usePrRuns } from "@/lib/hooks/reviews";
import { useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { checkedAgentIds, hasRunningMultiAgentChild, toggleAgent } from "@/components/multi-agent-select";
import { MIN_AGENTS, NO_PR, type StartError } from "./constants";
import { hasChangedFiles, isInformational, truncateTitle } from "./helpers";
import { s } from "./styles";

export function ConfigureRunView() {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: estimates } = useMultiAgentEstimates();
  const start = useStartMultiAgentRun();

  const [prNumber, setPrNumber] = React.useState<string>(NO_PR);
  // null = untouched: the enabled agents are checked (AC-10).
  const [selection, setSelection] = React.useState<ReadonlySet<string> | null>(null);
  const [error, setError] = React.useState<StartError | null>(null);

  const pr = (pulls ?? []).find((p) => String(p.number) === prNumber) ?? null;
  const prId = pr?.id ?? null;
  const { data: prRuns } = usePrRuns(prId);

  const all = agents ?? [];
  const byAgent = React.useMemo(() => indexEstimates(estimates?.agents), [estimates]);
  const checked = checkedAgentIds(all, selection);
  const checkedSet = new Set(checked);
  const aggregate = aggregateEstimates(checked, byAgent);

  const noFiles = pr != null && !hasChangedFiles(pr);
  const blocked = hasRunningMultiAgentChild(prRuns);
  const canRun =
    pr != null && prId != null && !noFiles && !blocked && checked.length >= MIN_AGENTS && !start.isPending;

  const crumb = [{ label: t("multiAgent.configure.crumbRoot") }, { label: t("multiAgent.configure.crumb") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const startRun = async () => {
    if (!pr || !prId) return;
    setError(null);
    try {
      await start.mutateAsync({ prId, agentIds: checked });
      router.push(`/repos/${repoId}/multi-agent/${pr.number}`);
    } catch (e) {
      // Branch on the status, never the message (client/docs/data-fetching.md).
      setError(e instanceof ApiError && e.status === 409 ? "conflict" : "startFailed");
    }
  };

  const onSelectPr = (v: string) => {
    setPrNumber(v);
    setError(null);
  };

  const options = [
    { value: NO_PR, label: t("multiAgent.configure.selectPr") },
    ...(pulls ?? []).map((p) => ({
      value: String(p.number),
      // Truncated so the native <select> cannot outgrow its frame (the kit control has no width cap).
      label: t("multiAgent.configure.prOption", { number: p.number, title: truncateTitle(p.title) }),
    })),
  ];

  const agentsStep = () => {
    if (agentsLoading) return <Skeleton height={96} />;
    if (all.length === 0) {
      return (
        <div style={s.placeholder}>
          <span style={s.placeholderTitle}>{t("multiAgent.configure.emptyTitle")}</span>
          <span style={s.placeholderBody}>{t("multiAgent.configure.emptyBody")}</span>
          <Button type="button" kind="secondary" size="sm" icon="Plus" onClick={() => router.push("/agents")}>
            {t("multiAgent.configure.createAgent")}
          </Button>
        </div>
      );
    }
    if (!pr) {
      return (
        <div style={s.placeholder}>
          <span style={s.placeholderIcon}>
            <Icon.GitPullRequest size={22} />
          </span>
          <span style={s.placeholderTitle}>{t("multiAgent.configure.pickPrTitle")}</span>
          <span style={s.placeholderBody}>{t("multiAgent.configure.pickPrBody")}</span>
        </div>
      );
    }
    return (
      <ul style={s.cards}>
        {all.map((a) => {
          const on = checkedSet.has(a.id);
          return (
            <li key={a.id} style={{ ...s.card, ...(on ? s.cardChecked : {}) }}>
              <div style={s.cardMain}>
                <Checkbox
                  checked={on}
                  onChange={() => setSelection(toggleAgent(all, selection, a.id))}
                  label={
                    <span style={s.cardLabel}>
                      <span style={s.cardName}>
                        <span style={s.ellipsis} title={a.name}>
                          {a.name}
                        </span>
                        {!a.enabled && <span style={s.tag}>{t("multiAgent.disabledTag")}</span>}
                      </span>
                      {a.description && <span style={s.cardDesc}>{a.description}</span>}
                    </span>
                  }
                />
              </div>
              <AgentEstimate estimate={byAgent.get(a.id)} />
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div>
          <h1 style={s.h1}>{t("multiAgent.configure.title")}</h1>
          <p style={s.subtitle}>{t("multiAgent.configure.subtitle")}</p>
        </div>

        <section style={s.step} aria-labelledby="ma-step-pr">
          <h2 id="ma-step-pr" style={s.stepTitle}>
            <span style={s.stepNum} aria-hidden="true">
              1
            </span>
            {t("multiAgent.configure.stepPullRequest")}
          </h2>
          <div style={s.stepBody}>
            {pullsLoading ? (
              <Skeleton height={40} width={360} />
            ) : (
              <div style={s.selectWrap}>
                <SelectInput mono={false} value={prNumber} onChange={onSelectPr} options={options} />
              </div>
            )}
            {!pullsLoading && (pulls ?? []).length === 0 && (
              <span style={s.notice} role="status">
                {t("multiAgent.configure.noPulls")}
              </span>
            )}
            {pr && isInformational(pr) && (
              <div style={s.notice} role="status">
                <Icon.AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>{t("runReview.mergedWarning")}</span>
              </div>
            )}
            {noFiles && (
              <div style={s.notice} role="status">
                <Icon.AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>{t("multiAgent.configure.noFiles")}</span>
              </div>
            )}
          </div>
        </section>

        <section style={s.step} aria-labelledby="ma-step-agents">
          <div style={s.stepHead}>
            <h2 id="ma-step-agents" style={s.stepTitle}>
              <span style={s.stepNum} aria-hidden="true">
                2
              </span>
              {t("multiAgent.configure.stepAgents")}
            </h2>
            {pr && all.length > 0 && (
              <button
                type="button"
                style={s.selectAll}
                onClick={() => setSelection(new Set(all.map((a) => a.id)))}
              >
                {t("multiAgent.configure.selectAll")}
              </button>
            )}
          </div>
          <div style={s.stepBody}>{agentsStep()}</div>
        </section>

        <div style={{ ...s.footer, paddingLeft: 38 }}>
          <Button
            type="button"
            kind="primary"
            size="lg"
            icon="Users"
            disabled={!canRun}
            loading={start.isPending}
            onClick={startRun}
          >
            {start.isPending
              ? t("multiAgent.configure.starting")
              : canRun
                ? t("multiAgent.configure.runCount", { count: checked.length })
                : t("multiAgent.configure.run")}
          </Button>
          {pr && checked.length > 0 && <EstimateSummary aggregate={aggregate} />}
        </div>
        {(blocked || error) && (
          <div style={{ paddingLeft: 38 }}>
            {blocked && (
              <span style={s.notice} role="status">
                {t("multiAgent.configure.inProgress")}
              </span>
            )}
            {error && (
              <span role="alert" style={s.error}>
                {t(`multiAgent.configure.${error}`)}
              </span>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default ConfigureRunView;
