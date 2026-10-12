"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { TextInput } from "@devdigest/ui";
import type { EvalCaseDetail } from "@devdigest/shared";
import { INPUT_TABS, type InputTab } from "../constants";
import { Field, controlProps } from "../Field";
import { isCreatedManually, pastedDiffPaths, type CaseDraft, type DraftField } from "../helpers";
import { s as shared } from "../styles";
import { nextTab, panelId, tabId } from "./helpers";
import { s } from "./styles";

/** The **Input** block (AC-15, AC-17): a `tablist` of Diff / Files / PR meta. Diff is the diff
 *  text area; Files lists the new-side paths found in the diff with the expectation's file
 *  marked; PR meta holds the PR title and description. While the input is locked (a stored
 *  finding-made case, AC-13) every field is read-only. Everything is a controlled input or
 *  escaped text — a diff, title, description or path is never interpreted as markup (UI-4). */
export function InputTabs({
  draft,
  expectedFile,
  readOnly,
  narrow,
  errors,
  c,
  set,
  touch,
}: {
  draft: CaseDraft;
  /** The file the Expected output points at, marked in the Files tab; null while unreadable. */
  expectedFile: string | null;
  readOnly: boolean;
  narrow: boolean;
  errors: Partial<Record<DraftField, string>>;
  /** The stored case, for the source line of the PR meta tab; null for a draft. */
  c: EvalCaseDetail | null;
  set: <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) => void;
  touch: (field: DraftField) => void;
}) {
  const t = useTranslations("eval");
  const [tab, setTab] = React.useState<InputTab>("diff");
  const paths = React.useMemo(() => pastedDiffPaths(draft.diff), [draft.diff]);
  const prNumber = c?.source?.pr_number;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = nextTab(tab, e.key);
    if (!next) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(tabId(next))?.focus();
  };

  return (
    <div style={s.wrap(narrow)}>
      <span style={shared.label}>{t("caseEditor.input.heading")}</span>
      <div role="tablist" aria-label={t("caseEditor.input.heading")} style={s.tablist} onKeyDown={onKeyDown}>
        {INPUT_TABS.map((key) => (
          <button
            key={key}
            id={tabId(key)}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={panelId(key)}
            tabIndex={tab === key ? 0 : -1}
            style={s.tab(tab === key)}
            onClick={() => setTab(key)}
          >
            {t(`caseEditor.input.tabs.${key}`)}
          </button>
        ))}
      </div>

      {tab === "diff" && (
        <div id={panelId("diff")} role="tabpanel" aria-labelledby={tabId("diff")} style={s.panel}>
          <textarea
            id="case-diff"
            className="mono"
            style={{ ...shared.pane, ...(readOnly ? shared.paneReadOnly : null) }}
            spellCheck={false}
            readOnly={readOnly}
            aria-label={t("caseEditor.fields.diff")}
            aria-required={readOnly ? undefined : true}
            aria-invalid={errors.diff ? true : undefined}
            aria-describedby={errors.diff ? "case-diff-error" : undefined}
            value={draft.diff}
            placeholder={t("caseEditor.fields.diffPlaceholder")}
            onChange={(e) => set("diff", e.target.value)}
            onBlur={() => touch("diff")}
          />
          {errors.diff ? (
            <span id="case-diff-error" role="alert" style={shared.fieldError}>
              {errors.diff}
            </span>
          ) : (
            !readOnly && <span style={shared.hint}>{t("caseEditor.fields.diffHint")}</span>
          )}
        </div>
      )}

      {tab === "files" && (
        <div id={panelId("files")} role="tabpanel" aria-labelledby={tabId("files")} style={s.scrollPanel}>
          {paths.length === 0 ? (
            <span style={shared.hint}>{t("caseEditor.input.noFiles")}</span>
          ) : (
            <ul aria-label={t("caseEditor.input.filesLabel")} style={s.list}>
              {paths.map((p) => (
                <li key={p} style={s.file(p === expectedFile)}>
                  <span className="mono" style={s.path} title={p}>
                    {p}
                  </span>
                  {p === expectedFile && <span style={s.mark}>{t("caseEditor.input.expectedFile")}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "meta" && (
        <div id={panelId("meta")} role="tabpanel" aria-labelledby={tabId("meta")} style={s.scrollPanel}>
          <Field id="case-title" label={t("caseEditor.fields.title")} required={!readOnly} error={errors.title}>
            <TextInput
              {...controlProps("case-title", errors.title, !readOnly)}
              readOnly={readOnly}
              value={draft.title}
              placeholder={t("caseEditor.fields.titlePlaceholder")}
              onChange={(v) => set("title", v)}
              onBlur={() => touch("title")}
            />
          </Field>
          <Field id="case-description" label={t("caseEditor.fields.description")} error={errors.description}>
            <textarea
              {...controlProps("case-description", errors.description)}
              style={{ ...shared.control, ...shared.textarea, ...(readOnly ? shared.paneReadOnly : null) }}
              rows={5}
              readOnly={readOnly}
              value={draft.description}
              placeholder={t("caseEditor.fields.descriptionPlaceholder")}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          {c && (
            <div style={shared.field}>
              <span style={shared.label}>{t("caseModal.source.heading")}</span>
              {isCreatedManually(c) ? (
                <span style={shared.muted}>{t("caseEditor.createdManually")}</span>
              ) : c.source && prNumber != null ? (
                <Link href={`/repos/${c.source.repo_id}/pulls/${prNumber}`} style={shared.link}>
                  {t("caseModal.source.link", { number: prNumber })}
                </Link>
              ) : (
                <span style={shared.muted}>{t("caseModal.source.unavailable")}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
