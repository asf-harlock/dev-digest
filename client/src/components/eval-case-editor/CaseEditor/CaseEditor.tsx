"use client";

import React from "react";
import { useEvalCase } from "@/lib/hooks/eval";
import { EditorModal, type CaseOwner } from "../EditorModal";

/**
 * The Case Editor modal, shared by the agent and the skill Evals tab (SPEC-09).
 *
 * - no `caseId` → create: every field empty but the type (AC-5);
 * - a manual case → edit: prefilled, every field editable (AC-13, AC-14, AC-15);
 * - a case with a source finding → name and notes editable, the rest read-only (EC-7).
 *
 * Closing with unsaved changes asks first (EC-8). A successful save closes the editor;
 * the lists refresh through the hooks' invalidation. `escapeEnabled` is false while a
 * dialog stacked on top (the delete confirmation) owns the Escape key.
 */
export function CaseEditor({
  owner,
  caseId = null,
  onClose,
  onRequestDelete,
  escapeEnabled = true,
}: {
  owner: CaseOwner;
  caseId?: string | null;
  onClose: () => void;
  onRequestDelete?: (caseId: string, name: string) => void;
  escapeEnabled?: boolean;
}) {
  const { data: c, isLoading, isError } = useEvalCase(caseId);
  const load = caseId === null || c ? "ready" : isError || !isLoading ? "error" : "loading";
  return (
    <EditorModal
      owner={owner}
      c={c ?? null}
      load={load}
      onClose={onClose}
      onRequestDelete={onRequestDelete}
      escapeEnabled={escapeEnabled}
    />
  );
}
