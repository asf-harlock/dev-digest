/* FindingsPanel — severity counters + hide-low-confidence + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { SeverityCounts, severityCounts } from "@/components/severity-counts";
import { FindingCard, type FindingEvalCase } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { usePullEvalCaseLinks } from "../../../../../../../lib/hooks/eval";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  agentId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  /** The agent that produced these findings (`review.agent_id`); a null / unknown agent is
   *  only an owner that is gone — the review's skills can still own a case (EC-3, EC-4). */
  agentId?: string | null;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severityFilter, setSeverityFilter] = React.useState<string | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // SPEC-08, SPEC-10: which findings already have an eval case and whether the producing
  // agent still exists. The case itself is made in the Case Editor the card opens.
  const links = usePullEvalCaseLinks(prId);
  const agents = useAgents();
  const linkByFinding = React.useMemo(
    () => new Map((links.data?.links ?? []).map((l) => [l.finding_id, l])),
    [links.data],
  );
  // Only call the agent "missing" once the agent list has loaded — never while it loads.
  const agentMissing = !agentId || (agents.data !== undefined && !agents.data.some((a) => a.id === agentId));

  const evalCaseFor = (findingId: string): FindingEvalCase => {
    const link = linkByFinding.get(findingId);
    return {
      link: link ? { caseId: link.case_id, agentId: link.agent_id } : null,
      agentMissing,
      pullId: prId,
    };
  };

  // Counts come off the FULL list, never the filtered one, so the numbers stay
  // put while you filter. They do drop on dismiss — severityCounts skips
  // dismissed findings and useFindingAction invalidates the reviews query.
  const counts = React.useMemo(() => severityCounts(findings), [findings]);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severityFilter),
    [findings, hideLow, severityFilter],
  );

  // Click a counter to keep only that severity; click it again to show all.
  const toggleSeverity = (sev: string) => {
    setSeverityFilter((cur) => (cur === sev ? null : sev));
    setFocusIdx(0);
  };

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      // While a modal is open (the Case Editor a card opens) these are not finding shortcuts,
      // whatever has focus: it can fall to <body> behind the modal.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <div style={s.counterGroup}>
          <SeverityCounts
            counts={counts}
            active={severityFilter}
            onSelect={toggleSeverity}
            label={t("panel.severityCounters")}
            titleFor={(sev, isActive) =>
              isActive
                ? t("panel.showAllSeverities")
                : t("panel.showOnlySeverity", { severity: sev })
            }
          />
        </div>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              evalCase={evalCaseFor(f.id)}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
