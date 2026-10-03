"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { ContextAttachPanel } from "@/components/context-attach-panel";
import { collectInherited } from "@/components/context-doc-list";
import { useAgentSkills, useSaveAgentContext } from "@/lib/hooks/agents";
import { useActiveRepo } from "@/lib/repo-context";

/** Agent editor's Context tab — attach repo documents to the agent. Rows from
 *  the agent's enabled skills are listed read-only ("via <skill name>"); the
 *  footer totals the merged list (AC-16, AC-20). Saves on every change. */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { repoId } = useActiveRepo();
  const skills = useAgentSkills(agent.id);
  const save = useSaveAgentContext();

  const inherited = React.useMemo(() => collectInherited(skills.data ?? []), [skills.data]);

  return (
    <ContextAttachPanel
      repoId={repoId}
      title={t("context.title")}
      hint={t("context.hint")}
      attached={agent.context_paths ?? []}
      inherited={inherited}
      showTotal
      saving={save.isPending}
      onSave={(paths) => save.mutate({ id: agent.id, paths })}
    />
  );
}
