import type { FindingRecord } from "@devdigest/shared";

/** Format a finding's line range ("11" when single-line, else "11-15"). */
export function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

/** What the panel tells the FindingCard about turning this finding into an eval case. */
export interface FindingEvalCase {
  /** The case already created from this finding for the agent (`GET /pulls/:id/eval-case-links`). */
  link: { caseId: string; agentId: string } | null;
  /** The review has no agent, or the agent is gone from the workspace (EC-3, EC-4). */
  agentMissing: boolean;
  /** The PR the finding belongs to — a save refreshes its case links (AC-9). */
  pullId: string;
}

/** The skills of the finding's review (`GET /findings/:id/eval-skills`) as the control reads
 *  them: `loaded` once they are known, `pending` while they are being fetched. */
export interface FindingSkillsState {
  loaded: boolean;
  pending: boolean;
  list: readonly { skill_id: string; has_case: boolean }[];
}

export type EvalButtonState = "in_set" | "undecided" | "agent_missing" | "checking" | "opening" | "ready";

/** Whether every owner of the review already has a case made from the finding: the agent
 *  (unless it is gone) and every recorded skill (AC-11). False while the skills are unknown
 *  and when there is no owner left at all. */
export function everyOwnerHasCase(
  ctrl: Pick<FindingEvalCase, "link" | "agentMissing">,
  skills: Pick<FindingSkillsState, "loaded" | "list">,
): boolean {
  if (!skills.loaded) return false;
  const agentOwns = !ctrl.agentMissing;
  if (!agentOwns && skills.list.length === 0) return false;
  return (!agentOwns || ctrl.link !== null) && skills.list.every((sk) => sk.has_case);
}

/** Button state. **In eval set** only when every owner has a case (AC-11), whatever the
 *  finding's decision is now; then the server's own check order: undecided, then no owner left
 *  (EC-1, EC-3). While the skills are still unknown and they could decide between **In eval
 *  set**, a disabled control and the button, the control waits (`checking`) instead of flashing
 *  the wrong one. */
export function evalButtonState(
  f: Pick<FindingRecord, "accepted_at" | "dismissed_at">,
  ctrl: Pick<FindingEvalCase, "link" | "agentMissing">,
  skills: FindingSkillsState,
  opening: boolean,
): EvalButtonState {
  if (everyOwnerHasCase(ctrl, skills)) return "in_set";
  if (!f.accepted_at && !f.dismissed_at) return "undecided";
  if (ctrl.agentMissing && skills.loaded && skills.list.length === 0) return "agent_missing";
  if (skills.pending && (ctrl.link || ctrl.agentMissing)) return "checking";
  if (opening) return "opening";
  return "ready";
}
