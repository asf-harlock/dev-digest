"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffGroup } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { ROLE_COLOR, ROLE_LABEL_KEY, ROLE_SUBTITLE_KEY, COLLAPSED_BY_DEFAULT } from "./constants";
import { fileByPath, filesWithFindingsCount } from "./helpers";
import { s, chevronFor } from "./styles";

/** Reviewer-ordered "Files changed" — one collapsible section per Smart Diff
 *  role, in the server's fixed order (core → tests → wiring → docs →
 *  boilerplate; empty groups are already omitted server-side). */
export function SmartDiffGroups({
  groups,
  files,
  commenting,
  findings,
}: {
  groups: SmartDiffGroup[];
  files: PrFile[];
  commenting?: DiffCommentApi;
  findings: DiffFindingsApi;
}) {
  const filesByPath = React.useMemo(() => fileByPath(files), [files]);
  return (
    <div style={s.list}>
      {groups.map((group) => (
        <SmartDiffGroupCard
          key={group.role}
          group={group}
          filesByPath={filesByPath}
          commenting={commenting}
          findings={findings}
        />
      ))}
    </div>
  );
}

function SmartDiffGroupCard({
  group,
  filesByPath,
  commenting,
  findings,
}: {
  group: SmartDiffGroup;
  filesByPath: Map<string, PrFile>;
  commenting?: DiffCommentApi;
  findings: DiffFindingsApi;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(!COLLAPSED_BY_DEFAULT.includes(group.role));

  const groupFiles = group.files
    .map((f) => filesByPath.get(f.path))
    .filter((f): f is PrFile => !!f);
  const findingsCount = filesWithFindingsCount(group);
  const label = t(`smartDiff.${ROLE_LABEL_KEY[group.role]}`);
  const subtitle = t(`smartDiff.${ROLE_SUBTITLE_KEY[group.role]}`);

  return (
    <div style={s.group}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={s.groupHeader}
      >
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={{ ...s.roleSquare, background: ROLE_COLOR[group.role] }} aria-hidden />
        <span style={s.roleLabel}>{label}</span>
        <span style={s.roleSubtitle}>{subtitle}</span>
        <span style={s.spacer} />
        {findingsCount > 0 && (
          <span
            className="tnum"
            style={s.findingsCount}
            title={t("smartDiff.filesWithFindings", { count: findingsCount })}
            aria-label={t("smartDiff.filesWithFindings", { count: findingsCount })}
          >
            ● {findingsCount}
          </span>
        )}
        <span className="tnum" style={s.fileCount}>
          {t("smartDiff.filesCount", { count: group.files.length })}
        </span>
      </div>
      {open && (
        <div style={s.groupBody}>
          <DiffViewer files={groupFiles} commenting={commenting} findings={findings} />
        </div>
      )}
    </div>
  );
}
