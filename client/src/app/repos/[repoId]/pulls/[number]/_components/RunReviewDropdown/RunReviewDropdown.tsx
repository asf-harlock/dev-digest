/* RunReviewDropdown — the "Run Review" button on the PR page. It opens the MultiAgentPopover
   (pick any set of agents and start one grouped run) and keeps the single-run actions of the
   original menu: "Run all enabled agents" / "Run only this" kick off POST /pulls/:id/review and
   hand the resulting runIds up so the parent can stream SSE live status. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { MultiAgentPopover } from "../MultiAgentPopover";
import { s } from "./styles";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const run = useRunReview();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLSpanElement>(null);

  // Close on an outside press or Escape (Escape returns focus to the trigger).
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.querySelector("button")?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const kick = async (opts: { all?: boolean; agentId?: string }) => {
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } catch {
      /* the global mutation handler already toasts the failure */
    } finally {
      onRunSettled?.();
    }
  };

  return (
    <div ref={ref} style={s.root}>
      <span
        ref={triggerRef}
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? s.mergedTrigger : undefined}
      >
        <Button
          type="button"
          kind={kind}
          size={size}
          iconRight="ChevronDown"
          icon="Sparkles"
          loading={run.isPending}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {run.isPending ? t("runReview.running") : t("runReview.runReview")}
        </Button>
      </span>
      {open && (
        <MultiAgentPopover
          prId={prId}
          warnMerged={warnMerged}
          singleRunPending={run.isPending}
          onClose={() => setOpen(false)}
          onRunAll={() => void kick({ all: true })}
          onRunOne={(agentId) => void kick({ agentId })}
        />
      )}
    </div>
  );
}
