"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { ContextAttachPanel } from "@/components/context-attach-panel";
import { useSaveSkillContext } from "@/lib/hooks/skills";
import { useActiveRepo } from "@/lib/repo-context";

/** Skill editor's "Project context to use" tab — attach repo documents to the
 *  skill; every agent that links the skill inherits them (AC-12, AC-21).
 *  Saves on every change; the skill's version is not bumped. */
export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { repoId } = useActiveRepo();
  const save = useSaveSkillContext();

  return (
    <ContextAttachPanel
      repoId={repoId}
      title={t("context.title")}
      hint={t("context.hint")}
      attached={skill.context_paths ?? []}
      showTotal={false}
      saving={save.isPending}
      onSave={(paths) => save.mutate({ id: skill.id, paths })}
    />
  );
}
