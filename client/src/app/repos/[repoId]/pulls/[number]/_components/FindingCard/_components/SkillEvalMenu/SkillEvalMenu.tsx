"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { useCreateSkillCaseFromFinding, useFindingSkills, type SkillCaseRejection } from "@/lib/hooks/skill-eval";
import { SKILL_REJECTION_KEY, skillEvalsTabHref } from "../../constants";
import { skillMenuState } from "../../helpers";
import { s } from "./styles";

/** "Turn into skill eval case" in an expanded finding's action row (AC-48..AC-53).
 *
 *  Mounted only while the card is expanded, so the skills of the finding's review run
 *  (`GET /findings/:id/eval-skills`) are fetched then and not before. Disabled with a
 *  reason for an undecided finding (EC-35) or a review no skill shaped (EC-36). A skill
 *  that already has a case shows "In eval set" and links to its Evals tab; picking another
 *  creates the case and flips its item without a reload (AC-52). A 422 shows inline as
 *  catalogue text; skill names are escaped text, truncated with a `title` (EC-33). */
export function SkillEvalMenu({
  finding,
}: {
  finding: Pick<FindingRecord, "id" | "accepted_at" | "dismissed_at">;
}) {
  const t = useTranslations("prReview");
  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const skills = useFindingSkills(finding.id, decided);
  const create = useCreateSkillCaseFromFinding(finding.id);
  const [open, setOpen] = React.useState(false);
  const [rejection, setRejection] = React.useState<SkillCaseRejection | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);

  const list = skills.data?.skills ?? [];
  const state = skillMenuState(finding, { loaded: skills.isSuccess, count: list.length });
  const reasonId = `skill-eval-reason-${finding.id}`;
  const panelId = `skill-eval-panel-${finding.id}`;
  const reason =
    state === "undecided"
      ? t("skillEval.undecidedTooltip")
      : state === "no_skill"
        ? t("skillEval.noSkillTooltip")
        : null;
  const disabled = state !== "ready";
  const expanded = open && !disabled;

  const close = React.useCallback(() => {
    setOpen(false);
    setRejection(null);
  }, []);

  // Close on Escape (focus returns to the trigger) and on a click outside.
  React.useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      close();
      triggerRef.current?.querySelector("button")?.focus();
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [expanded, close]);

  const pick = (skillId: string) => {
    setRejection(null);
    create.mutate(skillId, {
      onSuccess: (result) => {
        if (result.kind === "rejected") setRejection(result.code);
      },
    });
  };

  return (
    <div ref={rootRef} style={s.wrap}>
      <span ref={triggerRef} style={s.hintWrap} title={reason ?? t("skillEval.enabledHint")}>
        <Button
          kind="ghost"
          size="sm"
          icon="FlaskConical"
          iconRight="ChevronDown"
          disabled={disabled}
          aria-expanded={disabled ? undefined : expanded}
          aria-controls={expanded ? panelId : undefined}
          aria-describedby={reason ? reasonId : undefined}
          onClick={() => (expanded ? close() : setOpen(true))}
        >
          {t("skillEval.turnInto")}
        </Button>
        {reason && (
          <span id={reasonId} style={s.srOnly}>
            {reason}
          </span>
        )}
      </span>

      {expanded && (
        <ul id={panelId} aria-label={t("skillEval.listLabel")} style={s.panel}>
          {skills.isLoading && <li style={s.status}>{t("skillEval.loadingSkills")}</li>}
          {skills.isError && (
            <li role="alert" style={s.status}>
              {t("skillEval.loadError")}
            </li>
          )}
          {list.map((sk) => (
            <li key={sk.skill_id}>
              {sk.has_case ? (
                <Link
                  href={skillEvalsTabHref(sk.skill_id)}
                  style={s.item}
                  title={sk.name}
                  aria-label={t("skillEval.inEvalSetLink", { name: sk.name })}
                >
                  <span style={s.itemName}>{sk.name}</span>
                  <span style={s.inSet}>
                    <Icon.FlaskConical size={14} aria-hidden="true" />
                    {t("skillEval.inEvalSet")}
                  </span>
                </Link>
              ) : (
                <button
                  type="button"
                  style={s.item}
                  title={sk.name}
                  aria-label={t("skillEval.pick", { name: sk.name })}
                  disabled={create.isPending}
                  onClick={() => pick(sk.skill_id)}
                >
                  <span style={s.itemName}>{sk.name}</span>
                  {create.isPending && create.variables === sk.skill_id && (
                    <span style={s.status}>{t("skillEval.creating")}</span>
                  )}
                </button>
              )}
            </li>
          ))}
          {rejection && (
            <li role="alert" style={s.error}>
              {t(SKILL_REJECTION_KEY[rejection])}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
