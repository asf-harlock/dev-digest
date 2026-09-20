"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@devdigest/ui";
import type { ConventionDraftGrouping } from "@devdigest/shared";
import { s } from "./styles";

const MODES: ConventionDraftGrouping[] = ["merge", "per_candidate", "per_category"];

export function GroupingModeChooser({
  value,
  onChange,
}: {
  value: ConventionDraftGrouping;
  onChange: (v: ConventionDraftGrouping) => void;
}) {
  const t = useTranslations("conventions");
  const labelKey: Record<ConventionDraftGrouping, string> = {
    merge: "createModal.groupingMode.merge",
    per_candidate: "createModal.groupingMode.perCandidate",
    per_category: "createModal.groupingMode.perCategory",
  };
  const hintKey: Record<ConventionDraftGrouping, string> = {
    merge: "createModal.groupingMode.mergeHint",
    per_candidate: "createModal.groupingMode.perCandidateHint",
    per_category: "createModal.groupingMode.perCategoryHint",
  };

  return (
    <div>
      <div style={s.title}>{t("createModal.groupingMode.title")}</div>
      <div style={s.options}>
        {MODES.map((mode) => (
          <div key={mode} style={s.option}>
            <Chip active={value === mode} onClick={() => onChange(mode)}>
              {t(labelKey[mode])}
            </Chip>
            <span style={s.hint}>{t(hintKey[mode])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
