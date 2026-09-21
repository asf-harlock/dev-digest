"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Chip, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, AgentSkillDetail } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useSkills } from "../../../../../../../lib/hooks/skills";
import { filterSkills, mergeSkillsForAgent, moveSkill, reorderByDrag, typeBg, typeColor } from "./helpers";
import { s } from "./styles";

/** Agent editor's Skills tab — link, per-agent enable and reorder (spec §8).
 *  Lists every workspace skill, not just the ones already linked (D2): a row
 *  the agent has never linked renders unchecked, and checking it attaches it.
 *  The checkbox is otherwise a per-link kill switch: once a row IS linked, the
 *  row stays put and toggling never unlinks it. A skill whose GLOBAL `enabled`
 *  is false renders struck-through and cannot be switched on from here — the
 *  skill-level kill-switch outranks the per-agent link. */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const linkedQuery = useAgentSkills(agent.id);
  const allSkillsQuery = useSkills();
  const setSkills = useSetAgentSkills();
  const [query, setQuery] = React.useState("");
  const draggedId = React.useRef<string | null>(null);

  const isLoading = linkedQuery.isLoading || allSkillsQuery.isLoading;
  const isError = linkedQuery.isError || allSkillsQuery.isError;
  const refetch = () => {
    linkedQuery.refetch();
    allSkillsQuery.refetch();
  };

  const skills = mergeSkillsForAgent(allSkillsQuery.data ?? [], linkedQuery.data ?? []);
  const enabledCount = skills.filter((sk) => sk.link_enabled).length;
  const visible = filterSkills(skills, query);

  const submit = (next: AgentSkillDetail[]) => setSkills.mutate({ agentId: agent.id, skills: next });

  const toggle = (skill: AgentSkillDetail) => {
    if (!skill.enabled) return; // global kill-switch outranks the per-agent link
    submit(skills.map((sk) => (sk.id === skill.id ? { ...sk, link_enabled: !sk.link_enabled } : sk)));
  };

  const reorder = (skill: AgentSkillDetail, direction: -1 | 1) => {
    const next = moveSkill(skills, skill.id, direction);
    if (next) submit(next);
  };

  const onDrop = (targetId: string) => {
    const fromId = draggedId.current;
    draggedId.current = null;
    if (!fromId) return;
    const next = reorderByDrag(skills, fromId, targetId);
    if (next) submit(next);
  };

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={20} width={160} />
        <div style={{ marginTop: 16 }}>
          <Skeleton height={44} />
        </div>
      </div>
    );
  }
  if (isError) {
    return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h2 style={s.h2}>{t("skills.title")}</h2>
          <Chip active>{t("skills.enabledCount", { linked: enabledCount, total: skills.length })}</Chip>
        </div>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      {visible.length === 0 ? (
        <p style={s.empty}>{t("skills.empty")}</p>
      ) : (
        <ul style={s.list}>
          {visible.map((skill) => {
            const globalOff = !skill.enabled;
            const atFullIndex = skills.findIndex((sk) => sk.id === skill.id);
            const isFirst = atFullIndex <= 0;
            const isLast = atFullIndex >= skills.length - 1;
            return (
              <li
                key={skill.id}
                style={s.row}
                draggable
                onDragStart={(e) => {
                  draggedId.current = skill.id;
                  e.dataTransfer?.setData("text/plain", skill.id);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(skill.id);
                }}
              >
                <span style={s.handle} aria-hidden="true">
                  <Icon.Menu size={14} />
                </span>
                <Checkbox checked={skill.link_enabled} onChange={globalOff ? undefined : () => toggle(skill)} />
                <span className="mono" style={globalOff ? s.nameOff : s.name}>
                  {skill.name}
                </span>
                <Badge color={typeColor(skill.type)} bg={typeBg(skill.type)} mono>
                  {skill.type}
                </Badge>
                {skill.injection_flagged && (
                  <Badge icon="Shield" color="var(--crit)" bg="var(--crit-bg)">
                    {t("skills.injectionBadge")}
                  </Badge>
                )}
                <div style={s.reorder}>
                  <button
                    type="button"
                    aria-label={t("skills.moveUp")}
                    style={isFirst ? s.reorderBtnDisabled : s.reorderBtn}
                    disabled={isFirst}
                    onClick={() => reorder(skill, -1)}
                  >
                    <Icon.ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("skills.moveDown")}
                    style={isLast ? s.reorderBtnDisabled : s.reorderBtn}
                    disabled={isLast}
                    onClick={() => reorder(skill, 1)}
                  >
                    <Icon.ArrowDown size={13} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
