import type { EvalExpectationType, FindingCategory, Severity } from "@devdigest/shared";

/** Field limits of `EvalCaseInput` (EC-5). The server stays the authority; these only
 *  stop a save that would be rejected anyway. */
export const NAME_MAX_LENGTH = 80;
export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 5000;
export const NOTES_MAX_LENGTH = 2000;
export const FILE_MAX_LENGTH = 500;

/** 200 KB of UTF-8 — the same figure as the server's `MAX_DIFF_BYTES` (EC-1). */
export const MAX_DIFF_BYTES = 204_800;

/** The Expected output text cap, in UTF-8 bytes, checked BEFORE it is parsed (EC-7, UI-2).
 *  Client-side only: the server receives an object bounded by the Zod field limits. */
export const EXPECTED_MAX_BYTES = 10_000;

/** The expectation types, default first (AC-18). */
export const EXPECTATION_TYPES: readonly EvalExpectationType[] = ["must_find", "must_not_flag"];

/** Mirror of the `Severity` / `FindingCategory` enums. `@devdigest/shared` may only be
 *  imported as a type from the client (client/INSIGHTS.md), so the values live here. */
export const SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
export const CATEGORIES: readonly FindingCategory[] = ["bug", "security", "perf", "style", "test"];

/** The only keys an Expected output object may carry (AC-20). `type` is never one of them:
 *  it comes from the type switch. Anything else — `__proto__` and `constructor` included —
 *  is rejected, never copied (UI-1). */
export const EXPECTED_KEYS: readonly string[] = ["file", "start_line", "end_line", "severity", "category", "title"];

/** The Input tabs, in order (AC-15). */
export const INPUT_TABS = ["diff", "files", "meta"] as const;
export type InputTab = (typeof INPUT_TABS)[number];

/** Narrower than this the two columns stack and the modal body is the one scroll region (EC-11). */
export const NARROW_QUERY = "(max-width: 767px)";

/** Modal geometry (NFR-11): the editor owns the height so the kit `Modal` body never needs a
 *  scrollbar at 1280x720; every text pane scrolls inside itself. */
export const MODAL_WIDTH = 1080;
export const BODY_HEIGHT = "clamp(300px, calc(100vh - 340px), 640px)";
/** Height of a text pane once the columns are stacked (the body scrolls instead). */
export const STACKED_PANE_HEIGHT = 220;

/** The inline message of each field problem → `eval.caseEditor.problems.*` key. */
export const PROBLEM_KEYS = {
  name: { required: "caseModal.nameRequired", tooLong: "caseModal.nameTooLong" },
  title: { required: "caseEditor.problems.titleRequired", tooLong: "caseEditor.problems.titleTooLong" },
  description: { tooLong: "caseEditor.problems.descriptionTooLong" },
  diff: { tooLarge: "caseEditor.rejections.diffTooLarge" },
  notes: { tooLong: "caseEditor.problems.notesTooLong" },
} as const;

/** Rejection code of a save → `eval.caseEditor.rejections.*` key (EC-1..EC-6, EC-9, EC-42). */
export const REJECTION_KEYS = {
  frozen_diff_too_large: "caseEditor.rejections.diffTooLarge",
  no_patch: "caseEditor.rejections.noPatch",
  range_outside_diff: "caseEditor.rejections.rangeOutsideDiff",
  validation_error: "caseEditor.rejections.invalid",
  case_input_locked: "caseEditor.rejections.inputLocked",
  finding_undecided: "caseEditor.rejections.undecided",
  agent_missing: "caseEditor.rejections.agentMissing",
  skill_not_in_run: "caseEditor.rejections.skillNotInRun",
} as const;

export type SaveRejectionCode = keyof typeof REJECTION_KEYS;
