"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { DiffViewer } from "@/components/diff-viewer";
import { highlightRangeOf, previewFile, type CaseDraft } from "../helpers";
import { s } from "../styles";

/** Diff-view preview of the chosen file's section with the start–end lines outlined on
 *  the new-side numbers (AC-8). The viewer draws every line as escaped text, so a pasted
 *  `<script>` stays text (UI-3). Nothing shows until the chosen file has a hunk. */
export function DiffPreview({ draft, file }: { draft: Pick<CaseDraft, "diff" | "start" | "end">; file: string }) {
  const t = useTranslations("eval");
  const files = React.useMemo(() => {
    const f = previewFile(draft.diff, file);
    return f ? [f] : null;
  }, [draft.diff, file]);
  const range = highlightRangeOf(draft);
  return (
    <section style={s.section} aria-label={t("caseEditor.preview.label", { file: file || "—" })}>
      <h3 style={s.heading}>{t("caseEditor.preview.heading")}</h3>
      {files ? (
        <DiffViewer files={files} highlightRange={range} />
      ) : (
        <span style={s.hint}>{t("caseEditor.preview.empty")}</span>
      )}
    </section>
  );
}
