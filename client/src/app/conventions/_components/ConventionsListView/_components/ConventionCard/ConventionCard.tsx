"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, IconBtn, MonoLink, PercentProgress, SelectInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory, ConventionStatus } from "@devdigest/shared";
import { CONVENTION_CATEGORY_VALUES } from "./constants";
import { confidenceColor, evidenceLabel, formatCategoryLabel } from "./helpers";
import { s } from "./styles";

/**
 * One extracted convention candidate: rule, evidence (always visible, not
 * collapsed), confidence, and accept/reject/edit actions. Evidence fields
 * aren't editable here — only `rule`/`category`, the fields a reviewer is
 * actually likely to correct; the evidence citation is inspectable ground
 * truth from the scan.
 */
export function ConventionCard({
  candidate,
  onSetStatus,
  onSave,
  busy,
}: {
  candidate: ConventionCandidate;
  onSetStatus: (status: ConventionStatus) => void;
  onSave: (patch: { rule: string; category: ConventionCategory }) => void;
  busy?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [ruleDraft, setRuleDraft] = React.useState(candidate.rule);
  const [categoryDraft, setCategoryDraft] = React.useState<ConventionCategory>(candidate.category);
  const [copied, setCopied] = React.useState(false);

  const startEdit = () => {
    setRuleDraft(candidate.rule);
    setCategoryDraft(candidate.category);
    setEditing(true);
  };

  const save = () => {
    onSave({ rule: ruleDraft, category: categoryDraft });
    setEditing(false);
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard?.writeText(candidate.evidence.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard access denied/unavailable — no-op */
    }
  };

  const categoryOptions = CONVENTION_CATEGORY_VALUES.map((v) => ({
    value: v,
    label: formatCategoryLabel(v),
  }));

  return (
    <div style={s.card(candidate.status)}>
      <div style={s.row}>
        <div style={s.main}>
          {editing ? (
            <div style={s.editRow}>
              <FormField label={t("card.rule")}>
                <Textarea value={ruleDraft} onChange={setRuleDraft} rows={2} />
              </FormField>
              <FormField label={t("card.categoryLabel")}>
                <SelectInput
                  value={categoryDraft}
                  onChange={(v) => setCategoryDraft(v as ConventionCategory)}
                  options={categoryOptions}
                  mono={false}
                />
              </FormField>
              <div style={s.titleRow}>
                <Button kind="primary" size="sm" onClick={save}>
                  {t("card.save")}
                </Button>
                <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
                  {t("card.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div style={s.titleRow}>
              <span style={s.title}>{candidate.rule}</span>
              <Badge mono>{formatCategoryLabel(candidate.category)}</Badge>
            </div>
          )}

          <div style={s.evidenceBlock}>
            <div style={s.evidenceHeader}>
              <MonoLink>{evidenceLabel(candidate.evidence)}</MonoLink>
              <IconBtn
                icon={copied ? "Check" : "Copy"}
                label={copied ? t("card.copied") : t("card.copyEvidence")}
                onClick={copySnippet}
              />
            </div>
            <pre className="mono" style={s.snippet}>
              {candidate.evidence.snippet}
            </pre>
          </div>

          <PercentProgress
            value={candidate.confidence * 100}
            label={t("card.confidence")}
            color={confidenceColor(candidate.confidence)}
          />
        </div>

        <div style={s.actionsColumn}>
          {!editing && (
            <IconBtn icon="Edit" label={t("card.edit")} onClick={startEdit} />
          )}
          <Button
            kind={candidate.status === "accepted" ? "primary" : "secondary"}
            size="sm"
            icon={candidate.status === "accepted" ? "Check" : undefined}
            disabled={busy}
            onClick={() => onSetStatus(candidate.status === "accepted" ? "pending" : "accepted")}
          >
            {candidate.status === "accepted" ? t("card.accepted") : t("card.accept")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="X"
            active={candidate.status === "rejected"}
            disabled={busy}
            onClick={() => onSetStatus(candidate.status === "rejected" ? "pending" : "rejected")}
          >
            {candidate.status === "rejected" ? t("card.rejected") : t("card.reject")}
          </Button>
        </div>
      </div>
    </div>
  );
}
