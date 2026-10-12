"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, SelectInput } from "@devdigest/ui";
import type { EvalSkillOverview, Skill } from "@devdigest/shared";
import { useFittedModalWidth } from "@/lib/modal-width";
import { useStartEvalCaseRun } from "@/lib/hooks/eval";
import { useStartSkillEvalRun } from "@/lib/hooks/skill-eval";
import { isSkillOrLinkDisabled, selectedCarrierId, sortCarriers } from "./helpers";
import { s } from "./styles";

/** The run dialog behind **Run all evals**, the header **Run on evals** (AC-20..AC-22) and, with
 *  `caseId`, the single-case run of a skill-owned case (SPEC-10 AC-40, AC-51). Lists the skill's linked agents as carrier choices, shows "{n} cases · {2n} reviews"
 *  (AC-21) and warns — without blocking the run — about an injection-flagged skill (EC-31)
 *  and a disabled skill or link (EC-46). Names are escaped React text (UI-7). */
export function RunDialog({
  skill,
  overview,
  caseId = null,
  confirmDisabled = false,
  onClose,
  onStarted,
}: {
  /** Only what the dialog reads: the editor loads a skill by id, not the whole editor shape. */
  skill: Pick<Skill, "id" | "enabled" | "injection_flagged">;
  overview: EvalSkillOverview;
  /** Set: the dialog starts a run of this one case (`POST /eval-cases/:id/run`), not the set. */
  caseId?: string | null;
  /** Another run of the owner is in progress: the confirm button stays disabled (AC-49). */
  confirmDisabled?: boolean;
  onClose: () => void;
  /** The run to follow: the one just started, or the one already running (409). */
  onStarted: (runId: string) => void;
}) {
  const t = useTranslations("skills");
  const te = useTranslations("eval");
  const setStart = useStartSkillEvalRun(skill.id);
  const caseStart = useStartEvalCaseRun();
  const width = useFittedModalWidth(520);
  const pending = caseId ? caseStart.isPending : setStart.isPending;
  const carriers = React.useMemo(() => sortCarriers(overview.carriers), [overview.carriers]);
  const [chosen, setChosen] = React.useState<string | null>(null);
  const carrierId = selectedCarrierId(carriers, chosen, overview.latest?.carrier.agent_id);
  const carrier = carriers.find((c) => c.agent_id === carrierId);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const confirm = () => {
    if (!carrierId || confirmDisabled) return;
    if (caseId) {
      // A 409 resolves as `conflict`: the overview refetch shows the run that is in progress and
      // disables every run control, so there is nothing to follow from here.
      caseStart.mutate(
        { caseId, carrierAgentId: carrierId },
        {
          onSuccess: (result) => {
            if (result.kind === "started") onStarted(result.run.id);
            onClose();
          },
        },
      );
      return;
    }
    setStart.mutate(carrierId, {
      onSuccess: (run) => {
        onStarted(run.id);
        onClose();
      },
    });
  };

  const n = caseId ? 1 : overview.cases_total;
  return (
    <Modal
      width={width}
      title={caseId ? te("caseRun.carrierDialog.title") : t("evals.runDialog.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button type="button" kind="ghost" onClick={onClose} disabled={pending}>
            {t("evals.runDialog.cancel")}
          </Button>
          <span title={confirmDisabled ? te("caseRun.hints.running") : undefined}>
            <Button
              type="button"
              kind="primary"
              icon="Play"
              loading={pending}
              disabled={!carrierId || pending || confirmDisabled}
              onClick={confirm}
            >
              {pending
                ? t("evals.runDialog.starting")
                : caseId
                  ? te("caseRun.carrierDialog.confirm")
                  : t("evals.runDialog.confirm")}
            </Button>
          </span>
        </div>
      }
    >
      <div style={s.body}>
        <label style={s.field}>
          <span style={s.label}>{t("evals.runDialog.carrierLabel")}</span>
          <SelectInput
            value={carrierId ?? ""}
            onChange={setChosen}
            mono={false}
            options={carriers.map((c) => ({
              value: c.agent_id,
              label: t("evals.runDialog.carrierOption", { name: c.name, version: c.version, model: c.model }),
            }))}
          />
        </label>
        <p style={s.help}>
          {caseId ? te("caseRun.carrierDialog.carrierHelp") : t("evals.runDialog.carrierHelp")}
        </p>
        <p style={s.counts}>{t("evals.runDialog.counts", { cases: n, reviews: n * 2 })}</p>
        {skill.injection_flagged && (
          <p role="alert" style={s.warning}>
            <Icon.Shield size={16} style={s.warningIcon} aria-hidden="true" />
            {t("evals.runDialog.injectionWarning")}
          </p>
        )}
        {carrier && isSkillOrLinkDisabled(skill.enabled, carrier) && (
          <p role="alert" style={s.warning}>
            <Icon.AlertTriangle size={16} style={s.warningIcon} aria-hidden="true" />
            {t("evals.runDialog.disabledWarning", { carrier: carrier.name })}
          </p>
        )}
      </div>
    </Modal>
  );
}
