/* EvalsTab (skill) — the skill's eval set and its runs (SPEC-09: AC-1..AC-4, AC-12, AC-13,
   AC-16..AC-19, AC-33..AC-35, EC-11, EC-13, EC-29, EC-30). Case list, "+ New eval case",
   edit/delete through the shared Case Editor and delete dialog, **Run all evals** (opens the
   run dialog the editor owns), the passing count, the lift line, the Metric trend chart (AC-36, AC-37, EC-30) and the run's live status.
   The run state comes from `flow` (use-skill-eval-flow.ts), shared with the header button;
   data comes from hooks/skill-eval.ts only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { CaseEditor } from "@/components/eval-case-editor";
import { DeleteCaseDialog } from "@/components/delete-case-dialog";
import { EM_DASH } from "@/lib/eval-format";
import { useSkillEvalCases } from "@/lib/hooks/skill-eval";
import { runHintKey, type SkillEvalFlow } from "../../use-skill-eval-flow";
import { RunStatus } from "./_components/RunStatus";
import { SkillCaseList } from "./_components/SkillCaseList";
import { SkillMetricTrend } from "./_components/SkillMetricTrend";
import { liftParts, passingCounts } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ skill, flow }: { skill: Skill; flow: SkillEvalFlow }) {
  const t = useTranslations("skills");
  const te = useTranslations("eval");
  const cases = useSkillEvalCases(skill.id);
  const { overview, block } = flow;
  const latest = overview.data?.latest ?? null;
  const passing = passingCounts(latest);
  const hintKey = runHintKey(block);
  const hint = hintKey ? t(`evals.runHint.${hintKey}`) : undefined;
  /** The Case Editor: `"new"` for a blank case, else the id of the stored case to open. */
  const [editing, setEditing] = React.useState<"new" | { caseId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<{ id: string; name: string } | null>(null);

  const list = cases.data ?? [];
  const closeEditor = React.useCallback(() => setEditing(null), []);
  const closeDelete = React.useCallback(() => setDeleteTarget(null), []);
  const afterDelete = React.useCallback(() => {
    setDeleteTarget(null);
    setEditing(null);
  }, []);

  return (
    <div style={s.wrap}>
      <section style={s.section}>
        <div style={s.sectionHead}>
          <h2 style={s.sectionTitle}>{t("evals.casesHeading")}</h2>
          <span style={s.passing}>
            {passing ? te("evalsTab.passingSummary", passing) : t("evals.noPassing")}
          </span>
          <span style={s.spacer} />
          {(block === "no_agent" || block === "no_cases") && <span style={s.hint}>{hint}</span>}
          <span title={hint}>
            <Button
              kind="secondary"
              size="sm"
              icon="FlaskConical"
              disabled={block !== null}
              onClick={flow.openDialog}
            >
              {t("evals.runAll")}
            </Button>
          </span>
          <Button kind="secondary" size="sm" icon="Plus" onClick={() => setEditing("new")}>
            {t("evals.newCase")}
          </Button>
        </div>

        {overview.isError ? (
          <div style={s.summaryError} role="alert">
            {t("evals.overviewError")}
            <Button kind="ghost" size="sm" onClick={() => overview.refetch()}>
              {t("evals.retry")}
            </Button>
          </div>
        ) : latest ? (
          <p style={s.lift}>{t("evals.lift", liftParts(latest))}</p>
        ) : (
          <p style={s.lift}>{t("evals.liftNone", { value: EM_DASH })}</p>
        )}
        <RunStatus flow={flow} casesTotal={overview.data?.cases_total ?? list.length} />
        {overview.data && <SkillMetricTrend trend={overview.data.trend} />}

        {cases.isError ? (
          <ErrorState
            title={t("evals.errorTitle")}
            body={t("evals.loadError")}
            onRetry={() => cases.refetch()}
          />
        ) : cases.isLoading ? (
          <Skeleton height={64} />
        ) : list.length === 0 ? (
          <EmptyState
            icon="FlaskConical"
            title={t("evals.empty.title")}
            body={t("evals.empty.body")}
            cta={t("evals.newCase")}
            onCta={() => setEditing("new")}
          />
        ) : (
          <SkillCaseList
            cases={list}
            onOpen={(caseId) => setEditing({ caseId })}
            onDelete={(id, name) => setDeleteTarget({ id, name })}
          />
        )}
      </section>

      {editing && (
        <CaseEditor
          owner={{ kind: "skill", id: skill.id }}
          caseId={editing === "new" ? null : editing.caseId}
          onClose={closeEditor}
          onRequestDelete={(id, name) => setDeleteTarget({ id, name })}
          escapeEnabled={deleteTarget === null}
        />
      )}
      {deleteTarget && (
        <DeleteCaseDialog
          caseId={deleteTarget.id}
          caseName={deleteTarget.name}
          ownerKind="skill"
          onClose={closeDelete}
          onDeleted={afterDelete}
        />
      )}
    </div>
  );
}
