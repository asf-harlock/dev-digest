"use client";

import { useTranslations } from "next-intl";
import { Badge, FormField, SelectInput, TextInput, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { MarkdownBodyEditor } from "@/components/markdown-body-editor";
import { estimateTokens } from "@/lib/token-estimate";
import type { DraftState } from "../../helpers";
import { SKILL_TYPE_VALUES } from "./constants";
import { formatSkillTypeLabel } from "./helpers";
import { s } from "./styles";

export function DraftSkillForm({
  draft,
  onChange,
  disabled,
}: {
  draft: DraftState;
  onChange: (patch: Partial<DraftState>) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("conventions");
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: formatSkillTypeLabel(v) }));
  const unsaved = draft.status !== "saved";

  return (
    <div>
      <FormField label={t("createModal.fields.name")} required>
        <TextInput
          value={draft.name}
          onChange={(v) => onChange({ name: v })}
          mono
          disabled={disabled}
        />
        {draft.status === "error" && draft.errorMessage && (
          <div style={s.errorText}>{draft.errorMessage}</div>
        )}
      </FormField>

      <FormField label={t("createModal.fields.description")}>
        <TextInput value={draft.description} onChange={(v) => onChange({ description: v })} disabled={disabled} />
      </FormField>

      <div style={s.typeRow}>
        <div style={s.typeField}>
          <FormField label={t("createModal.fields.type")}>
            <SelectInput
              value={draft.type}
              onChange={(v) => onChange({ type: v as SkillType })}
              options={typeOptions}
              mono={false}
            />
          </FormField>
        </div>
        <div style={s.enabledField}>
          <label style={s.enabledLabel}>
            {t("createModal.fields.enabled")}
            <Toggle on={draft.enabled} onChange={(v) => onChange({ enabled: v })} size={16} />
          </label>
          <div style={s.enabledHint}>{t("createModal.fields.enabledHint")}</div>
        </div>
      </div>

      <FormField
        label={t("createModal.fields.body")}
        required
        right={
          <div style={s.metaRow}>
            <Badge mono>{`${draft.name || "skill"}.md`}</Badge>
            {unsaved && <Badge color="var(--warn)">{t("createModal.unsaved")}</Badge>}
            <Badge mono>{t("createModal.tokenCount", { count: estimateTokens(draft.body) })}</Badge>
          </div>
        }
      >
        <MarkdownBodyEditor value={draft.body} onChange={(v) => onChange({ body: v })} minRows={10} />
      </FormField>
    </div>
  );
}
