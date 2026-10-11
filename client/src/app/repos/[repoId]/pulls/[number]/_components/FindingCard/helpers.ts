import type { FindingRecord } from "@devdigest/shared";
import type { EvalRejectionCode } from "./constants";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** What the card tells the FindingCard about turning this finding into an eval case. */
export interface FindingEvalCase {
  /** The case already created from this finding (`GET /pulls/:id/eval-case-links`). */
  link: { caseId: string; agentId: string } | null;
  /** The review has no agent, or the agent is gone from the workspace (EC-2). */
  agentMissing: boolean;
  /** `POST …/eval-case` for this finding is in flight. */
  creating: boolean;
  /** Last 422 for this finding, shown inline (EC-4, EC-5). */
  rejection: EvalRejectionCode | null;
  onCreate: () => void;
}

export type EvalButtonState = "in_set" | "undecided" | "agent_missing" | "creating" | "ready";

/** Button state in the server's own check order: undecided → agent missing (EC-1, EC-2).
 *  A finding that already has a case is "in set" whatever its decision now is (AC-9). */
export function evalButtonState(
  f: Pick<FindingRecord, "accepted_at" | "dismissed_at">,
  ctrl: Pick<FindingEvalCase, "link" | "agentMissing" | "creating">,
): EvalButtonState {
  if (ctrl.link) return "in_set";
  if (!f.accepted_at && !f.dismissed_at) return "undecided";
  if (ctrl.agentMissing) return "agent_missing";
  if (ctrl.creating) return "creating";
  return "ready";
}

export type SkillMenuState = "undecided" | "no_skill" | "ready";

/** Menu state in the server's own check order: undecided first (EC-35), then a review
 *  with no recorded skill (EC-36). While the skill list is still loading the menu is
 *  `ready` — its panel says "loading" — so a slow request never reads as "no skill". */
export function skillMenuState(
  f: Pick<FindingRecord, "accepted_at" | "dismissed_at">,
  skills: { loaded: boolean; count: number },
): SkillMenuState {
  if (!f.accepted_at && !f.dismissed_at) return "undecided";
  if (skills.loaded && skills.count === 0) return "no_skill";
  return "ready";
}
