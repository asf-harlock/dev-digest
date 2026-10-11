"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput } from "@devdigest/ui";
import type { EvalCaseDetail, EvalExpectationType, FindingCategory, Severity } from "@devdigest/shared";
import {
  CATEGORIES,
  DIFF_ROWS,
  DESCRIPTION_ROWS,
  EXPECTATION_TYPES,
  NOTES_ROWS,
  SEVERITIES,
} from "../constants";
import type { CaseDraft, DraftField, EditorMode } from "../helpers";
import { s } from "../styles";
import { DiffPreview } from "../DiffPreview";
import { Field, controlProps } from "../Field";
import { ReadOnlyCase } from "../ReadOnlyCase";

/** What the editor form needs from its owner: the draft, the resolved file, the
 *  already-translated inline errors, and the two ways to change state. */
export interface CaseFormState {
  draft: CaseDraft;
  mode: EditorMode;
  /** The resolved file and the diff's new-side paths to choose from (AC-6, AC-7). */
  file: string;
  paths: readonly string[];
  errors: Partial<Record<DraftField, string>>;
  set: <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) => void;
  touch: (field: DraftField) => void;
}

/** The fields of the Case Editor. Every value is a controlled input or escaped text — a
 *  pasted diff, title, description, path or note is never interpreted as markup (UI-3,
 *  UI-8, UI-9). In a finding-derived case only name and notes are inputs (EC-7). */
export function CaseFields({ form, c }: { form: CaseFormState; c: EvalCaseDetail | null }) {
  const t = useTranslations("eval");
  const { draft, mode, errors, set, touch } = form;
  const locked = mode === "finding";
  const mustFind = draft.type === "must_find";

  return (
    <>
      <Field id="case-name" label={t("caseEditor.fields.name")} required error={errors.name}>
        <TextInput
          {...controlProps("case-name", errors.name, true)}
          value={draft.name}
          placeholder={t("caseModal.namePlaceholder")}
          onChange={(v) => set("name", v)}
          onBlur={() => touch("name")}
        />
      </Field>

      {locked && c && (
        <>
          <p style={s.note}>{t("caseEditor.findingNote")}</p>
          <ReadOnlyCase c={c} />
        </>
      )}

      {!locked && (
        <>
          <Field id="case-title" label={t("caseEditor.fields.title")} required error={errors.title}>
            <TextInput
              {...controlProps("case-title", errors.title, true)}
              value={draft.title}
              placeholder={t("caseEditor.fields.titlePlaceholder")}
              onChange={(v) => set("title", v)}
              onBlur={() => touch("title")}
            />
          </Field>

          <Field id="case-description" label={t("caseEditor.fields.description")} error={errors.description}>
            <textarea
              {...controlProps("case-description", errors.description)}
              style={{ ...s.control, ...s.textarea }}
              rows={DESCRIPTION_ROWS}
              value={draft.description}
              placeholder={t("caseEditor.fields.descriptionPlaceholder")}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>

          <Field
            id="case-diff"
            label={t("caseEditor.fields.diff")}
            required
            error={errors.diff}
            hint={t("caseEditor.fields.diffHint")}
          >
            <textarea
              {...controlProps("case-diff", errors.diff, true)}
              className="mono"
              style={{ ...s.control, ...s.textarea }}
              rows={DIFF_ROWS}
              spellCheck={false}
              value={draft.diff}
              placeholder={t("caseEditor.fields.diffPlaceholder")}
              onChange={(e) => set("diff", e.target.value)}
              onBlur={() => touch("diff")}
            />
          </Field>

          <Field id="case-file" label={t("caseEditor.fields.file")} required error={errors.file}>
            {form.paths.length > 0 ? (
              <select
                {...controlProps("case-file", errors.file, true)}
                className="mono"
                style={s.control}
                value={form.file}
                onChange={(e) => set("file", e.target.value)}
              >
                {form.paths.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            ) : (
              <TextInput
                {...controlProps("case-file", errors.file, true)}
                mono
                value={draft.file}
                placeholder={t("caseEditor.fields.filePlaceholder")}
                onChange={(v) => set("file", v)}
                onBlur={() => touch("file")}
              />
            )}
          </Field>

          <Field id="case-type" label={t("caseEditor.fields.type")} required>
            <select
              id="case-type"
              style={s.control}
              value={draft.type}
              onChange={(e) => set("type", e.target.value as EvalExpectationType)}
            >
              {EXPECTATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === "must_find" ? t("caseModal.expectation.mustFind") : t("caseModal.expectation.mustNotFlag")}
                </option>
              ))}
            </select>
          </Field>

          <div style={s.twoCols}>
            <Field
              id="case-start"
              label={t("caseEditor.fields.startLine")}
              required
              error={errors.start}
              hint={t("caseEditor.fields.linesHint")}
            >
              <TextInput
                {...controlProps("case-start", errors.start, true)}
                mono
                inputMode="numeric"
                value={draft.start}
                onChange={(v) => set("start", v)}
                onBlur={() => touch("start")}
              />
            </Field>
            <Field id="case-end" label={t("caseEditor.fields.endLine")} required error={errors.end}>
              <TextInput
                {...controlProps("case-end", errors.end, true)}
                mono
                inputMode="numeric"
                value={draft.end}
                onChange={(v) => set("end", v)}
                onBlur={() => touch("end")}
              />
            </Field>
          </div>

          <DiffPreview draft={draft} file={form.file} />

          {mustFind && (
            <div style={s.twoCols}>
              <Field id="case-severity" label={t("caseEditor.fields.severity")}>
                <select
                  id="case-severity"
                  style={s.control}
                  value={draft.severity}
                  onChange={(e) => set("severity", e.target.value as Severity | "")}
                >
                  <option value="">{t("caseEditor.fields.notSet")}</option>
                  {SEVERITIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="case-category" label={t("caseEditor.fields.category")}>
                <select
                  id="case-category"
                  style={s.control}
                  value={draft.category}
                  onChange={(e) => set("category", e.target.value as FindingCategory | "")}
                >
                  <option value="">{t("caseEditor.fields.notSet")}</option>
                  {CATEGORIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </>
      )}

      <Field id="case-notes" label={t("caseEditor.fields.notes")} error={errors.notes}>
        <textarea
          {...controlProps("case-notes", errors.notes)}
          style={{ ...s.control, ...s.textarea }}
          rows={NOTES_ROWS}
          value={draft.notes}
          placeholder={t("caseEditor.fields.notesPlaceholder")}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
    </>
  );
}
