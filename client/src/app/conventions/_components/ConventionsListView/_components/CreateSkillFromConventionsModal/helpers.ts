import type { SkillDraft, SkillType } from "@devdigest/shared";
import { SKILL_NAME_PATTERN } from "./constants";

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

export interface DraftState {
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  evidenceFiles: string[];
  status: DraftSaveStatus;
  errorMessage?: string;
  skillId?: string;
  version?: number;
}

export function toDraftState(draft: SkillDraft): DraftState {
  return {
    name: draft.name,
    description: draft.description,
    type: draft.type,
    enabled: true,
    body: draft.body,
    evidenceFiles: draft.evidence_files,
    status: "idle",
  };
}

export function isValidDraftName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name);
}

export function savedCount(drafts: DraftState[]): number {
  return drafts.filter((d) => d.status === "saved").length;
}

export function anySaving(drafts: DraftState[]): boolean {
  return drafts.some((d) => d.status === "saving");
}
