/* TabsView — one tab per agent; the panel shows its summary card and its findings as
   expandable FindingCards (accept / dismiss / turn into an eval case), reusing the PR page's
   FindingCard unchanged. Accept/dismiss go through useFindingAction with the PR id, which also
   refreshes this page's snapshot. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentColumn } from "@devdigest/shared";
import { FindingCard, type FindingEvalCase } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { useAgents } from "@/lib/hooks/agents";
import { usePullEvalCaseLinks } from "@/lib/hooks/eval";
import { AgentStatus } from "../AgentStatus";
import { AgentSummaryCard } from "../AgentSummaryCard";
import { sortedFindings } from "../AgentColumnCard";
import { panelId, tabId } from "./constants";
import { nextTabIndex, pickColumn, scoreColor } from "./helpers";
import { s } from "./styles";

export function TabsView({
  columns,
  prId,
  repoFullName,
  headSha,
  onOpenTrace,
}: {
  columns: AgentColumn[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (runId: string) => void;
}) {
  const t = useTranslations("runs");
  const action = useFindingAction();
  const [selected, setSelected] = React.useState<string | null>(null);
  const tabRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  // Same inputs the PR page's FindingsPanel feeds the card's eval-case control (AC-29).
  const links = usePullEvalCaseLinks(prId);
  const agents = useAgents();
  const linkByFinding = React.useMemo(
    () => new Map((links.data?.links ?? []).map((l) => [l.finding_id, l])),
    [links.data],
  );

  const active = pickColumn(columns, selected);
  if (!active) return null;

  // Only call the agent "missing" once the agent list has loaded — never while it loads.
  const agentMissing =
    !active.agent_id || (agents.data !== undefined && !agents.data.some((a) => a.id === active.agent_id));
  const evalCaseFor = (findingId: string): FindingEvalCase => {
    const link = linkByFinding.get(findingId);
    return {
      link: link ? { caseId: link.case_id, agentId: link.agent_id } : null,
      agentMissing,
      pullId: prId,
    };
  };

  const findings = active.status === "done" ? sortedFindings(active.findings) : [];

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    const next = nextTabIndex(e.key, index, columns.length);
    if (next === null) return;
    e.preventDefault();
    const target = columns[next];
    if (!target) return;
    setSelected(target.run_id);
    tabRefs.current.get(target.run_id)?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label={t("tabs.listLabel")} style={s.list}>
        {columns.map((c, i) => {
          const on = c.run_id === active.run_id;
          return (
            <button
              key={c.run_id}
              ref={(el) => {
                if (el) tabRefs.current.set(c.run_id, el);
                else tabRefs.current.delete(c.run_id);
              }}
              type="button"
              role="tab"
              id={tabId(c.run_id)}
              aria-selected={on}
              aria-controls={panelId(c.run_id)}
              tabIndex={on ? 0 : -1}
              onClick={() => setSelected(c.run_id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              style={s.tab(on)}
            >
              <span style={c.agent_name ? undefined : s.deletedName}>{c.agent_name ?? t("deletedAgent")}</span>
              {c.status === "done" && c.score != null ? (
                <span className="tnum" style={s.score(scoreColor(c.score))} role="img" aria-label={t("column.score", { score: c.score })}>
                  {c.score}
                </span>
              ) : (
                <AgentStatus status={c.status} />
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={panelId(active.run_id)} aria-labelledby={tabId(active.run_id)} style={s.panel}>
        <AgentSummaryCard column={active} onOpenTrace={onOpenTrace} />
        {active.status === "done" && findings.length === 0 && <div style={s.empty}>{t("column.noFindings")}</div>}
        {findings.length > 0 && (
          <div style={s.findings}>
            {findings.map((f, i) => (
              <FindingCard
                key={f.id}
                f={f}
                defaultExpanded={i === 0}
                pending={action.isPending}
                repoFullName={repoFullName}
                headSha={headSha}
                evalCase={evalCaseFor(f.id)}
                onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
