/* MultiAgentPopover — the "Pick agents to run" panel under the Run Review button (SPEC-11 AC-1…AC-4,
   AC-47). Rows are every agent of the workspace (enabled ones start checked); the primary button
   starts ONE grouped run through POST /pulls/:id/multi-agent-run and opens the results page. The
   existing single-run actions (run all enabled / run only this) stay, handed in by the parent. */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, Icon } from "@devdigest/ui";
import { AgentEstimate, EstimateSummary, aggregateEstimates, indexEstimates } from "@/components/agent-estimate";
import { useAgents } from "@/lib/hooks/agents";
import { useMultiAgentEstimates, useStartMultiAgentRun } from "@/lib/hooks/multi-agent";
import { usePrRuns } from "@/lib/hooks/reviews";
import { ApiError } from "@/lib/api";
import { MIN_AGENTS, type StartError } from "./constants";
import { checkedAgentIds, hasRunningMultiAgentChild, toggleAgent } from "@/components/multi-agent-select";
import { s } from "./styles";

export function MultiAgentPopover({
  prId,
  warnMerged = false,
  singleRunPending = false,
  onClose,
  onRunAll,
  onRunOne,
}: {
  prId: string;
  /** PR is merged/closed: lead with the "review is informational" note (EC-9). */
  warnMerged?: boolean;
  /** A single-agent run request is in flight — its buttons wait. */
  singleRunPending?: boolean;
  onClose: () => void;
  /** AC-4: run every enabled agent (POST /pulls/:id/review {all}). */
  onRunAll: () => void;
  /** AC-4: run exactly this agent (POST /pulls/:id/review {agentId}). */
  onRunOne: (agentId: string) => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const { data: agents } = useAgents();
  const { data: estimates } = useMultiAgentEstimates();
  const { data: prRuns } = usePrRuns(prId);
  const start = useStartMultiAgentRun();
  // null = untouched: the enabled agents are checked (AC-2). Clear / toggles make it explicit.
  const [selection, setSelection] = React.useState<ReadonlySet<string> | null>(null);
  const [error, setError] = React.useState<StartError | null>(null);

  const all = agents ?? [];
  const byAgent = React.useMemo(() => indexEstimates(estimates?.agents), [estimates]);
  const checked = checkedAgentIds(all, selection);
  const checkedSet = new Set(checked);
  const aggregate = aggregateEstimates(checked, byAgent);
  const blocked = hasRunningMultiAgentChild(prRuns);
  const canRun = checked.length >= MIN_AGENTS && !blocked && !start.isPending;
  const hasEnabled = all.some((a) => a.enabled);
  const hintId = React.useId();

  const startRun = async () => {
    setError(null);
    try {
      await start.mutateAsync({ prId, agentIds: checked });
      onClose();
      router.push(`/repos/${repoId}/multi-agent/${number}`);
    } catch (e) {
      // Branch on the status, never the message (client/docs/data-fetching.md).
      setError(e instanceof ApiError && e.status === 409 ? "conflict" : "startFailed");
    }
  };

  const goAgents = () => {
    onClose();
    router.push("/agents");
  };

  if (all.length === 0) {
    return (
      <div role="dialog" aria-label={t("multiAgent.popover.title")} style={s.panel}>
        <div style={s.empty}>
          <span style={s.emptyTitle}>{t("multiAgent.popover.emptyTitle")}</span>
          <span style={s.emptyBody}>{t("multiAgent.popover.emptyBody")}</span>
          <Button type="button" kind="secondary" size="sm" icon="Plus" onClick={goAgents}>
            {t("multiAgent.popover.createAgent")}
          </Button>
        </div>
      </div>
    );
  }

  const hint = blocked
    ? t("multiAgent.popover.inProgress")
    : checked.length < MIN_AGENTS
      ? t("multiAgent.popover.needTwo")
      : null;

  return (
    <div role="dialog" aria-label={t("multiAgent.popover.title")} style={s.panel}>
      <div style={s.header}>
        <h3 style={s.title}>{t("multiAgent.popover.title")}</h3>
        <button type="button" style={s.clear} onClick={() => setSelection(new Set())}>
          {t("multiAgent.popover.clear")}
        </button>
      </div>

      {warnMerged && (
        <div style={s.warn}>
          <Icon.AlertTriangle size={13} style={{ flexShrink: 0 }} />
          <span>{t("runReview.mergedWarning")}</span>
        </div>
      )}

      <ul style={s.list}>
        {all.map((a) => (
          <li key={a.id} style={s.row}>
            <div style={s.rowMain}>
              <Checkbox
                checked={checkedSet.has(a.id)}
                onChange={() => setSelection(toggleAgent(all, selection, a.id))}
                label={
                  <span style={s.agentLabel}>
                    <Icon.Cpu size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    <span style={s.name} title={a.name}>
                      {a.name}
                    </span>
                    {!a.enabled && <span style={s.tag}>{t("multiAgent.disabledTag")}</span>}
                  </span>
                }
              />
            </div>
            <AgentEstimate estimate={byAgent.get(a.id)} />
            <button
              type="button"
              style={s.only}
              disabled={singleRunPending}
              title={t("multiAgent.popover.runOnlyAgent", { name: a.name })}
              aria-label={t("multiAgent.popover.runOnlyAgent", { name: a.name })}
              onClick={() => {
                onClose();
                onRunOne(a.id);
              }}
            >
              <Icon.Play size={12} />
            </button>
          </li>
        ))}
      </ul>

      <div style={s.runArea}>
        <Button
          type="button"
          kind="primary"
          full
          icon="Users"
          disabled={!canRun}
          loading={start.isPending}
          aria-describedby={hint ? hintId : undefined}
          onClick={startRun}
        >
          {start.isPending
            ? t("multiAgent.popover.starting")
            : t("multiAgent.popover.run", { count: checked.length })}
        </Button>
        {checked.length > 0 && (
          <div style={s.estimate}>
            <EstimateSummary aggregate={aggregate} />
          </div>
        )}
        {hint && (
          <span id={hintId} style={s.hint}>
            {hint}
          </span>
        )}
        {error && (
          <span role="alert" style={s.error}>
            {t(`multiAgent.popover.${error}`)}
          </span>
        )}
      </div>

      <div style={s.divider} />
      <button
        type="button"
        style={{ ...s.menuItem, ...(hasEnabled ? {} : { opacity: 0.6 }) }}
        disabled={singleRunPending}
        onClick={() => {
          onClose();
          onRunAll();
        }}
      >
        <Icon.Play size={14} style={{ color: "var(--text-muted)" }} />
        {t("runReview.runAll")}
      </button>
      <button type="button" style={s.menuItem} onClick={goAgents}>
        <Icon.Settings size={14} style={{ color: "var(--text-muted)" }} />
        {t("runReview.configureAgents")}
      </button>
    </div>
  );
}

export default MultiAgentPopover;
