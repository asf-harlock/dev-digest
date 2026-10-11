"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Modal, SelectInput } from "@devdigest/ui";
import type { EvalSkillOverview, Skill } from "@devdigest/shared";
import { useStartSkillEvalRun } from "@/lib/hooks/skill-eval";
import { isSkillOrLinkDisabled, selectedCarrierId, sortCarriers } from "./helpers";
import { s } from "./styles";

/** The run dialog behind both **Run all evals** and the header **Run on evals** (AC-20..AC-22).
 *  Lists the skill's linked agents as carrier choices, shows "{n} cases · {2n} reviews"
 *  (AC-21) and warns — without blocking the run — about an injection-flagged skill (EC-31)
 *  and a disabled skill or link (EC-46). Names are escaped React text (UI-7). */
export function RunDialog({
  skill,
  overview,
  onClose,
  onStarted,
}: {
  skill: Skill;
  overview: EvalSkillOverview;
  onClose: () => void;
  /** The run to follow: the one just started, or the one already running (409). */
  onStarted: (runId: string) => void;
}) {
  const t = useTranslations("skills");
  const start = useStartSkillEvalRun(skill.id);
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
    if (!carrierId) return;
    start.mutate(carrierId, {
      onSuccess: (run) => {
        onStarted(run.id);
        onClose();
      },
    });
  };

  const n = overview.cases_total;
  return (
    <Modal
      width={520}
      title={t("evals.runDialog.title")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose} disabled={start.isPending}>
            {t("evals.runDialog.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Play"
            loading={start.isPending}
            disabled={!carrierId || start.isPending}
            onClick={confirm}
          >
            {start.isPending ? t("evals.runDialog.starting") : t("evals.runDialog.confirm")}
          </Button>
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
        <p style={s.help}>{t("evals.runDialog.carrierHelp")}</p>
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
