/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { FindingRecord, PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { anchorFindings, hasActiveFindings, type DiffFindingsApi } from "../findings";
import { s, chevronFor, findingS } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Smart Diff findings anchored to a given parsed line — mirrors `threadsForLine`
 *  above, just over `anchorFindings`'s matched map instead of comment threads. */
function findingsForLine(ln: Line, matched: Map<string, FindingRecord[]>): FindingRecord[] {
  if (matched.size === 0) return [];
  const out: FindingRecord[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** Smart Diff findings for this PR, injected by the route layer (DiffTab) —
   *  optional so the plain Files-changed flow (no Smart Diff data yet/failed)
   *  keeps working unchanged. */
  findings?: DiffFindingsApi;
}) {
  const t = useTranslations("shell");
  const tSmart = useTranslations("prReview");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  // This file's Smart Diff findings, anchored to a rendered line where
  // possible — a finding whose line isn't in this patch (`unanchored`) still
  // renders, in a block above the lines, and still counts toward the dot.
  const fileFindings = React.useMemo(
    () => findings?.byPath.get(file.path) ?? [],
    [findings, file.path],
  );
  const { matched: matchedFindings, unanchored } = React.useMemo(
    () => anchorFindings(lines, fileFindings),
    [lines, fileFindings],
  );
  const hasDot = !!findings && hasActiveFindings(fileFindings);

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <div style={s.filePathWrap}>
          <span className="mono" style={s.filePath}>
            {file.path}
          </span>
          {hasDot && (
            <span title={tSmart("smartDiff.hasFindings")} aria-label={tSmart("smartDiff.hasFindings")}>
              <Badge dot color="var(--crit)" style={s.findingDot} />
            </span>
          )}
        </div>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {findings && unanchored.length > 0 && (
            <div style={findingS.unanchoredWrap}>
              <div style={findingS.unanchoredTitle}>{tSmart("smartDiff.unanchoredFindings")}</div>
              {unanchored.map((f) => findings.renderFinding(f))}
            </div>
          )}
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                findings={findingsForLine(ln, matchedFindings)}
                renderFinding={findings?.renderFinding}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
