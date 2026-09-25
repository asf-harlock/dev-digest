/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@/lib/types";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { highestSeverity } from "../findings";
import { type Line } from "../helpers";
import { SEVERITY_LINE_COLOR, SEVERITY_LINE_LABEL_KEY } from "../constants";
import { s, lineRowFor, lineSignFor, findingBarFor, findingS } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  findings,
  renderFinding,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** This line's Smart Diff findings (already anchored by FileCard), if any. */
  findings?: FindingRecord[];
  renderFinding?: (f: FindingRecord) => React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const lineFindings = findings ?? [];
  // Bar + label reflect only live findings (dismissed ones never count toward a
  // severity signal); every finding, dismissed included, still renders its card.
  const topSeverity = highestSeverity(lineFindings.filter((f) => !f.dismissed_at));
  const TopSeverityIcon = topSeverity ? Icon[SEV[topSeverity].icon] : null;

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), ...(topSeverity ? findingBarFor(SEVERITY_LINE_COLOR[topSeverity]) : {}) }}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {topSeverity && TopSeverityIcon && (
          <span style={findingS.lineLabel(SEVERITY_LINE_COLOR[topSeverity])}>
            <TopSeverityIcon size={11} />
            {t(`smartDiff.${SEVERITY_LINE_LABEL_KEY[topSeverity]}`)}
          </span>
        )}
      </div>

      {renderFinding && lineFindings.length > 0 && (
        <div style={findingS.findingsWrap}>{lineFindings.map((f) => renderFinding(f))}</div>
      )}

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
