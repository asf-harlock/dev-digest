"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingsApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, usePrReviews, useFindingAction } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SmartDiffGroups } from "../SmartDiffGroups";
import { groupFindingsByPath, latestFindingsPerAgent } from "./helpers";
import { s } from "./styles";

type DiffOrder = "smart" | "original";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** For FindingCard's "open on GitHub" line link — same props ReviewRunAccordion/
   *  FindingsPanel already thread through on the other tabs. */
  repoFullName?: string | null;
  headSha?: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [order, setOrder] = React.useState<DiffOrder>("smart");

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  // ---- Smart Diff: reviewer-ordered groups + inline findings (L03) --------
  const { data: reviews } = usePrReviews(prId);
  const { data: smartDiff, isLoading: smartDiffLoading, isError: smartDiffError } = useSmartDiff(prId);
  const findingAction = useFindingAction();

  const allFindings = React.useMemo(() => latestFindingsPerAgent(reviews ?? []), [reviews]);
  const byPath = React.useMemo(() => groupFindingsByPath(allFindings), [allFindings]);
  const findings: DiffFindingsApi = {
    byPath,
    renderFinding: (f) => (
      <FindingCard
        key={f.id}
        f={f}
        defaultExpanded
        pending={findingAction.isPending}
        repoFullName={repoFullName}
        headSha={headSha}
        onAction={(action) => findingAction.mutate({ findingId: f.id, action, prId: prId ?? undefined })}
      />
    ),
  };

  // The grouped view needs the Smart Diff response to have actually loaded —
  // once it errors, or a PR has no groups at all, we fall back to today's flat
  // DiffViewer, so e2e flow 05 ("Files changed" shows src/config.ts) never
  // depends on this endpoint succeeding.
  const smartAvailable = !smartDiffLoading && !smartDiffError && (smartDiff?.groups.length ?? 0) > 0;
  const showSmart = order === "smart" && smartAvailable;
  // While the query is still in flight (Smart order only), show a lightweight
  // placeholder instead of painting the flat DiffViewer first — the flat view
  // would otherwise mount every FileCard, then unmount and remount all of
  // them (losing per-file open state) the instant the query resolves and
  // SmartDiffGroups takes over. Falling back to the flat view is reserved for
  // a genuine error or empty-groups response, not "still loading".
  const showSmartLoading = order === "smart" && smartDiffLoading;

  const totalAdditions = files.reduce((sum, f) => sum + (f.additions ?? 0), 0);
  const totalDeletions = files.reduce((sum, f) => sum + (f.deletions ?? 0), 0);

  return (
    <section>
      <SectionLabel icon="Code">{t("smartDiff.title")}</SectionLabel>
      <div style={s.statsRow}>
        <span className="tnum" style={s.statsText}>
          {t("smartDiff.filesCount", { count: filesCount })} ·{" "}
          <span style={s.addText}>+{totalAdditions}</span> <span style={s.delText}>−{totalDeletions}</span>
        </span>
        <div style={s.rightControls}>
          {commentCount > 0 && (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setShowComments((v) => !v)}
            >
              {showComments ? "Hide comments" : "Show comments"} ({commentCount})
            </Button>
          )}
          {smartAvailable && <OrderToggle order={order} onChange={setOrder} />}
        </div>
      </div>

      {showSmartLoading ? (
        <div style={s.loadingNote}>
          <Icon.RefreshCw size={14} />
          {t("smartDiff.loading")}
        </div>
      ) : showSmart && smartDiff ? (
        <SmartDiffGroups groups={smartDiff.groups} files={files} commenting={commenting} findings={findings} />
      ) : (
        // Original order, or the smart-diff query failed / returned no groups.
        // NOTE: switching between this flat view and SmartDiffGroups — via the
        // toggle above, or automatically the first time this branch is chosen
        // instead of the loading placeholder — mounts a different element
        // tree, so every FileCard/CodeLine/InlineComposer remounts and resets
        // its per-file open state (and drops any in-progress comment draft).
        // Accepted for now; see the plan for the tracked follow-up.
        <DiffViewer files={files} commenting={commenting} findings={findings} />
      )}
    </section>
  );
}

/** Smart order / Original order segmented control (see styles.ts's comment on
 *  why this isn't a `@devdigest/ui` primitive). */
function OrderToggle({ order, onChange }: { order: DiffOrder; onChange: (order: DiffOrder) => void }) {
  const t = useTranslations("prReview");
  return (
    <div style={s.toggleWrap} role="group" aria-label={t("smartDiff.title")}>
      <button
        type="button"
        aria-pressed={order === "smart"}
        onClick={() => onChange("smart")}
        style={s.toggleBtn(order === "smart")}
      >
        {t("smartDiff.smartOrder")}
      </button>
      <button
        type="button"
        aria-pressed={order === "original"}
        onClick={() => onChange("original")}
        style={s.toggleBtn(order === "original")}
      >
        {t("smartDiff.originalOrder")}
      </button>
    </div>
  );
}
