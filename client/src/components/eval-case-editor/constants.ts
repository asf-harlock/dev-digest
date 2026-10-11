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

/** The expectation types, default first (AC-5). */
export const EXPECTATION_TYPES: readonly EvalExpectationType[] = ["must_find", "must_not_flag"];

/** Mirror of the `Severity` / `FindingCategory` enums. `@devdigest/shared` may only be
 *  imported as a type from the client (client/INSIGHTS.md), so the values live here. */
export const SEVERITIES: readonly Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];
export const CATEGORIES: readonly FindingCategory[] = ["bug", "security", "perf", "style", "test"];

/** Textarea heights (rows). */
export const DIFF_ROWS = 10;
export const NOTES_ROWS = 3;
export const DESCRIPTION_ROWS = 3;

/** The inline message of each field problem → `eval.caseEditor.problems.*` key. */
export const PROBLEM_KEYS = {
  name: { required: "caseModal.nameRequired", tooLong: "caseModal.nameTooLong" },
  title: { required: "caseEditor.problems.titleRequired", tooLong: "caseEditor.problems.titleTooLong" },
  description: { tooLong: "caseEditor.problems.descriptionTooLong" },
  diff: { tooLarge: "caseEditor.rejections.diffTooLarge" },
  file: { required: "caseEditor.problems.fileRequired", tooLong: "caseEditor.problems.fileTooLong" },
  start: { required: "caseEditor.problems.lineInvalid", lineInvalid: "caseEditor.problems.lineInvalid" },
  end: {
    required: "caseEditor.problems.lineInvalid",
    lineInvalid: "caseEditor.problems.lineInvalid",
    endBeforeStart: "caseEditor.problems.endBeforeStart",
  },
  notes: { tooLong: "caseEditor.problems.notesTooLong" },
} as const;

/** Rejection code of a save → `eval.caseEditor.rejections.*` key (EC-1..EC-6, EC-42). */
export const REJECTION_KEYS = {
  frozen_diff_too_large: "caseEditor.rejections.diffTooLarge",
  no_patch: "caseEditor.rejections.noPatch",
  range_outside_diff: "caseEditor.rejections.rangeOutsideDiff",
  validation_error: "caseEditor.rejections.invalid",
  case_input_locked: "caseEditor.rejections.inputLocked",
} as const;
