"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SelectInput } from "@devdigest/ui";
import { useAgents, useAgentSkills, useSetAgentSkills } from "@/lib/hooks/agents";
import { useSkills } from "@/lib/hooks/skills";
import { appendSkillsToAgent } from "./helpers";
import { NO_AGENT_SELECTED } from "./constants";
import { s } from "./styles";

/**
 * Closing step of "create skill from conventions": attach the just-created
 * skill(s) to an agent using the same mechanism as the Agent editor's Skills
 * tab (`useSetAgentSkills`, full-set replace) — the modal only creates the
 * skill via `POST /skills`, so nothing links it to a prompt without this.
 */
export function LinkToAgentPanel({ skillIds }: { skillIds: string[] }) {
  const t = useTranslations("conventions");
  const agentsQuery = useAgents();
  const allSkillsQuery = useSkills();
  const [agentId, setAgentId] = React.useState(NO_AGENT_SELECTED);
  const linkedSkillsQuery = useAgentSkills(agentId || null);
  const setAgentSkills = useSetAgentSkills();
  const [linkedAgentName, setLinkedAgentName] = React.useState<string | null>(null);

  const agents = agentsQuery.data ?? [];

  if (agents.length === 0) {
    return <p style={s.empty}>{t("createModal.linkAgent.noAgents")}</p>;
  }

  if (linkedAgentName) {
    return <p style={s.linked}>{t("createModal.linkAgent.linked", { name: linkedAgentName })}</p>;
  }

  const busy = linkedSkillsQuery.isFetching || allSkillsQuery.isFetching || setAgentSkills.isPending;

  const link = () => {
    if (!agentId) return;
    const next = appendSkillsToAgent(linkedSkillsQuery.data ?? [], allSkillsQuery.data ?? [], skillIds);
    setAgentSkills.mutate(
      { agentId, skills: next },
      { onSuccess: () => setLinkedAgentName(agents.find((a) => a.id === agentId)?.name ?? agentId) },
    );
  };

  return (
    <div style={s.wrap}>
      <p style={s.hint}>{t("createModal.linkAgent.hint")}</p>
      <div style={s.row}>
        <div style={s.select}>
          <SelectInput
            value={agentId}
            onChange={setAgentId}
            options={[
              { value: NO_AGENT_SELECTED, label: t("createModal.linkAgent.placeholder") },
              ...agents.map((a) => ({ value: a.id, label: a.name })),
            ]}
          />
        </div>
        <Button kind="secondary" icon="Link" disabled={!agentId || busy} loading={setAgentSkills.isPending} onClick={link}>
          {t("createModal.linkAgent.button")}
        </Button>
      </div>
      {setAgentSkills.isError && <p style={s.error}>{t("createModal.linkAgent.error")}</p>}
    </div>
  );
}
