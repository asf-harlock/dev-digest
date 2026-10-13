/** Constants for ConfigureRunView. */

/** Fewest agents a multi-agent run needs (AC-11). */
export const MIN_AGENTS = 2;

/** The value of the "no pull request selected" option of the selector. */
export const NO_PR = "";

/** Longest PR title shown in the selector options (chars); longer titles end in an ellipsis. */
export const PR_TITLE_MAX_CHARS = 52;

/** Content width (px) of the single-column form. */
export const CONTENT_MAX_WIDTH = 920;

/** Why starting a run failed, as the i18n key suffix of `multiAgent.configure.*`. */
export type StartError = "conflict" | "startFailed";
