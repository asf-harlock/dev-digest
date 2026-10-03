/** Top band of the viewport in which a heading counts as "current" (AC-12):
 *  the upper 25%. Expressed as an IntersectionObserver rootMargin. */
export const SPY_ROOT_MARGIN = "0px 0px -75% 0px";
/** Fallback to release the click-lock when `scrollend` never fires (old browsers, no movement). */
export const LOCK_FALLBACK_MS = 1200;
