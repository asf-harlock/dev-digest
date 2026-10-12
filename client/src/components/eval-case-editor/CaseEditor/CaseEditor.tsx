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
 * Closing with unsaved changes asks first (EC-10). A successful save closes the editor;
 * the lists refresh through the hooks' invalidation. `escapeEnabled` is false while a
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
  const { data: c, isLoading, isError } = useEvalCase(caseId);
  const load = caseId === null || c ? "ready" : isError || !isLoading ? "error" : "loading";
  return (
    <EditorModal
      owner={owner}
      seed={seed}
      c={c ?? null}
      load={load}
      onClose={onClose}
      onSaved={onSaved}
      onRequestDelete={onRequestDelete}
      escapeEnabled={escapeEnabled}
    />
  );
}
