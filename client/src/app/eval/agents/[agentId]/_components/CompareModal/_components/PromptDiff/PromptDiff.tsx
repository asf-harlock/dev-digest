/* PromptDiff — line diff of the two snapshotted system prompts (AC-48, AC-50, UI-8).
   Prompt text is author-supplied: it is rendered only as React text children inside a
   monospace pre-wrap element, never through Markdown or innerHTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalCompare } from "@devdigest/shared";
import { s } from "./styles";

export function PromptDiff({
  diff,
  changed,
  oldVersion,
  newVersion,
}: {
  diff: EvalCompare["prompt_diff"];
  changed: boolean;
  oldVersion: number;
  newVersion: number;
}) {
  const t = useTranslations("eval");
  return (
    <section aria-labelledby="eval-prompt-diff-heading">
      <h3 id="eval-prompt-diff-heading" style={s.heading}>
        <Icon.FileText size={14} />
        {t("compare.promptDiff.heading")}
      </h3>
      {!changed ? (
        <p style={s.unchanged}>{t("compare.promptDiff.unchanged")}</p>
      ) : (
        <>
          <p style={s.legend}>
            <span>
              <span aria-hidden="true">{t("compare.promptDiff.removedMarker")} </span>
              {t("compare.promptDiff.removedLabel", { version: oldVersion })}
            </span>
            <span>
              <span aria-hidden="true">{t("compare.promptDiff.addedMarker")} </span>
              {t("compare.promptDiff.addedLabel", { version: newVersion })}
            </span>
          </p>
          <div className="mono" style={s.box}>
            {diff.map((line, i) => (
              <div key={i} style={s.line(line.kind)}>
                <span aria-hidden="true" style={s.marker}>
                  {line.kind === "removed"
                    ? t("compare.promptDiff.removedMarker")
                    : line.kind === "added"
                      ? t("compare.promptDiff.addedMarker")
                      : ""}
                </span>
                {line.kind !== "context" && (
                  <span style={s.srOnly}>
                    {line.kind === "removed"
                      ? t("compare.promptDiff.removedLine", { version: oldVersion })
                      : t("compare.promptDiff.addedLine", { version: newVersion })}
                  </span>
                )}
                <pre style={s.text}>{line.text}</pre>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
