/* DisagreementBlock — "Where agents disagree": one row per location the agents' findings
   overlap on, one cell per completed agent (severity or "did not flag" plus its note).
   The conflicts come from the server snapshot; this block only filters and lays them out.
   Notes are plain text, never markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { AgentColumn, Conflict } from "@devdigest/shared";
import { SEVERITY_KEY, VERDICT_COLOR } from "./constants";
import { compareState, visibleConflicts } from "./helpers";
import { s } from "./styles";

export function DisagreementBlock({
  conflicts,
  columns,
}: {
  conflicts: Conflict[];
  columns: AgentColumn[];
}) {
  const t = useTranslations("runs");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const cmp = compareState(columns);
  const rows = visibleConflicts(conflicts, onlyConflicts);
  const nameByRun = React.useMemo(() => new Map(columns.map((c) => [c.run_id, c.agent_name])), [columns]);

  return (
    <section style={s.wrap} aria-labelledby="disagree-title">
      <div style={s.header}>
        <h2 id="disagree-title" style={s.title}>
          <Icon.Activity size={14} />
          {t("conflicts.title")}
        </h2>
        {cmp.state === "rows" && (
          <label style={s.toggle}>
            {t("conflicts.onlyConflicts")}
            <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={16} />
          </label>
        )}
      </div>

      {cmp.running && (
        <div style={s.note}>{t("conflicts.comparing", { done: cmp.done, total: cmp.total })}</div>
      )}
      {cmp.state === "needs_two" && <div style={s.note}>{t("conflicts.needsTwo")}</div>}

      {cmp.state === "rows" && rows.length === 0 && <div style={s.note}>{t("conflicts.empty")}</div>}
      {cmp.state === "rows" && rows.length > 0 && (
        <ul style={s.list}>
          {rows.map((c) => (
            <li
              key={`${c.file}:${c.line}:${c.title}`}
              style={s.group(c.takes.length > 0 && c.takes.every((tk) => tk.dismissed))}
            >
              <div style={s.groupHead}>
                <span className="mono" style={s.location}>
                  {c.file}:{c.line}
                </span>
                <span style={s.groupTitle}>{c.title}</span>
              </div>
              <div style={s.takes}>
                {c.takes.map((tk) => {
                  const flagged = tk.verdict !== "ignored";
                  const agent = nameByRun.get(tk.run_id) ?? tk.persona;
                  return (
                    <div key={tk.run_id} style={s.take(tk.dismissed)}>
                      <span style={{ ...s.agent, ...(agent ? null : s.deletedAgent) }}>{agent ?? t("deletedAgent")}</span>
                      <span style={s.verdict}>
                        <span style={s.dot(VERDICT_COLOR[tk.verdict] ?? "var(--text-muted)")} aria-hidden="true" />
                        {flagged ? (
                          t(`severity.${SEVERITY_KEY[tk.verdict] ?? "info"}`)
                        ) : (
                          <span style={s.didNotFlag}>{t("conflicts.didNotFlag")}</span>
                        )}
                        {tk.dismissed && <span style={s.dismissedTag}>{t("conflicts.dismissed")}</span>}
                      </span>
                      {tk.note && <p style={s.takeNote}>{tk.note}</p>}
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
