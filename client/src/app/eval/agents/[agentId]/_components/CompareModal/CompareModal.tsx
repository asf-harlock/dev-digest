/* CompareModal — two finished runs side by side (AC-45..AC-50, EC-25, EC-26, EC-34).
   Ratios are over the cases present in both runs; cost is each run's whole cost_usd.
   Deltas are computed here from the raw values (the server returns none). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { formatCostUsd, formatPercent } from "@/lib/eval-format";
import { useEvalCompare } from "@/lib/hooks/eval";
import { useModalA11y } from "../../../../hooks";
import { CompareCard } from "./_components/CompareCard";
import { PromptDiff } from "./_components/PromptDiff";
import { commonRatios, compareErrorKey, hasSkillChanges } from "./helpers";
import { s } from "./styles";

export function CompareModal({
  runA,
  runB,
  onClose,
}: {
  runA: string;
  runB: string;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const bodyRef = useModalA11y(onClose);
  const { data, isLoading, error, refetch } = useEvalCompare(runA, runB);

  const title = data
    ? t("compare.title", { old: data.old.agent_version, new: data.new.agent_version })
    : t("compare.loading");

  const errKey = error
    ? compareErrorKey(
        error instanceof ApiError ? error.status : undefined,
        error instanceof ApiError ? error.code : undefined,
      )
    : null;

  const ratios = data ? commonRatios(data) : null;
  const scope = t("compare.cards.commonOnly");

  return (
    <Modal width={920} title={title} onClose={onClose}>
      <div ref={bodyRef} tabIndex={-1} style={s.body}>
        {isLoading && (
          <div role="status" aria-label={t("compare.loading")} style={{ display: "grid", gap: 10 }}>
            <Skeleton height={80} />
            <Skeleton height={160} />
          </div>
        )}
        {errKey && (
          <ErrorState
            title={t(`compare.${errKey}`)}
            onRetry={errKey === "loadError" ? () => refetch() : undefined}
          />
        )}
        {data && ratios && (
          <>
            <div style={s.cards}>
              <CompareCard
                label={t("compare.cards.recall")}
                kind="points"
                oldValue={ratios.old.recall}
                newValue={ratios.new.recall}
                oldText={formatPercent(ratios.old.recall)}
                newText={formatPercent(ratios.new.recall)}
                scope={scope}
              />
              <CompareCard
                label={t("compare.cards.precision")}
                kind="points"
                oldValue={ratios.old.precision}
                newValue={ratios.new.precision}
                oldText={formatPercent(ratios.old.precision)}
                newText={formatPercent(ratios.new.precision)}
                scope={scope}
              />
              <CompareCard
                label={t("compare.cards.citation")}
                kind="points"
                oldValue={ratios.old.citation_accuracy}
                newValue={ratios.new.citation_accuracy}
                oldText={formatPercent(ratios.old.citation_accuracy)}
                newText={formatPercent(ratios.new.citation_accuracy)}
                scope={scope}
              />
              <CompareCard
                label={t("compare.cards.cost")}
                kind="cost"
                oldValue={data.old.cost_usd}
                newValue={data.new.cost_usd}
                oldText={formatCostUsd(data.old.cost_usd)}
                newText={formatCostUsd(data.new.cost_usd)}
                scope={t("compare.cards.wholeRun")}
              />
            </div>

            <p style={s.counts}>
              {t("compare.caseCounts", {
                common: data.common_cases,
                onlyOld: data.only_old,
                onlyNew: data.only_new,
                old: data.old.agent_version,
                new: data.new.agent_version,
              })}
            </p>
            {data.common_cases === 0 && (
              <p role="status" style={s.notice}>
                {t("compare.noCommon")}
              </p>
            )}
            {data.model_change && (
              <p style={s.changes}>
                {t("compare.modelChange", { from: data.model_change.from, to: data.model_change.to })}
              </p>
            )}
            {data.strategy_change && (
              <p style={s.changes}>
                {t("compare.strategyChange", { from: data.strategy_change.from, to: data.strategy_change.to })}
              </p>
            )}

            <PromptDiff
              diff={data.prompt_diff}
              changed={data.prompt_changed}
              oldVersion={data.old.agent_version}
              newVersion={data.new.agent_version}
            />

            {hasSkillChanges(data.skills_diff) && (
              <section aria-labelledby="eval-skills-diff-heading">
                <h3 id="eval-skills-diff-heading" style={s.skillsHeading}>
                  {t("compare.skills.heading", { old: data.old.agent_version, new: data.new.agent_version })}
                </h3>
                {(
                  [
                    ["added", data.skills_diff.added],
                    ["removed", data.skills_diff.removed],
                    ["changed", data.skills_diff.changed],
                  ] as const
                ).map(([kind, names]) =>
                  names.length === 0 ? null : (
                    <div key={kind} style={s.skillGroup}>
                      <span style={s.skillGroupLabel}>{t(`compare.skills.${kind}`)}</span>
                      {names.map((name) => (
                        <span key={name} className="mono" style={s.skillName}>
                          {name}
                        </span>
                      ))}
                    </div>
                  ),
                )}
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
