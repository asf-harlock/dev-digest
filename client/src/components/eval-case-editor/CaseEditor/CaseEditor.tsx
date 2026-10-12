"use client";

import React from "react";
import { useEvalCase } from "@/lib/hooks/eval";
import { EditorModal, type CaseOwner, type CaseSeed } from "../EditorModal";

/**
 * The Case Editor modal, shared by the agent and the skill Evals tab and the finding card
 * (SPEC-09, SPEC-10).
 *
 * - `seed` → a draft built from a finding (AC-1): editable until the first Save, the owner
 *   chosen in the picker, nothing created until Save;
 * - no `caseId` → create: every field empty but the type;
 * - a manual case → edit: prefilled, every field editable;
 * - a case with a source finding → name and notes editable, the rest read-only (AC-13).
 *
 * Closing with unsaved changes asks first (EC-10). A successful save closes the editor — unless
 * **Run on save** is on (SPEC-10 AC-45): then the editor stays open on the saved case (a new id
 * after a replace) and starts its run. The lists refresh through the hooks' invalidation. `escapeEnabled` is false while a
 * dialog stacked on top (the delete confirmation) owns the Escape key.
 */
export function CaseEditor({
  owner = null,
  seed = null,
  caseId = null,
  onClose,
  onSaved,
  onRequestDelete,
  escapeEnabled = true,
}: {
  owner?: CaseOwner | null;
  seed?: CaseSeed | null;
  caseId?: string | null;
  onClose: () => void;
  /** A save created the case — the finding card toasts and refreshes. */
  onSaved?: () => void;
  onRequestDelete?: (caseId: string, name: string) => void;
  escapeEnabled?: boolean;
}) {
  /** The case a save with **Run on save** left the editor on; it takes over from `caseId`/`seed`. */
  const [saved, setSaved] = React.useState<{ caseId: string; owner: CaseOwner } | null>(null);
  const activeId = saved?.caseId ?? caseId;
  const { data: c, isLoading, isError } = useEvalCase(activeId);
  const load = activeId === null || c ? "ready" : isError || !isLoading ? "error" : "loading";
  return (
    <EditorModal
      owner={saved?.owner ?? owner}
      seed={saved ? null : seed}
      c={c ?? null}
      load={load}
      onClose={onClose}
      onSaved={onSaved}
      onStay={(savedId, savedOwner) => setSaved({ caseId: savedId, owner: savedOwner })}
      onRequestDelete={onRequestDelete}
      escapeEnabled={escapeEnabled}
    />
  );
}
