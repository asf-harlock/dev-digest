/** Constants for MultiAgentPopover. */

/** Popover width (px); it shrinks on narrow windows (see styles). */
export const POPOVER_WIDTH = 340;

/** Fewest agents a multi-agent run needs (AC-47). */
export const MIN_AGENTS = 2;

/** Rows of agents shown before the list scrolls (px). */
export const LIST_MAX_HEIGHT = 280;

/** Why starting a run failed, as the i18n key suffix of `multiAgent.popover.*`. */
export type StartError = "conflict" | "startFailed";
