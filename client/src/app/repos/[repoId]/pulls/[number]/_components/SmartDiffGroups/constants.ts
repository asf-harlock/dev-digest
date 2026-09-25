import type { SmartDiffRole } from "@devdigest/shared";

/**
 * Small colour square next to each group's label. Reuses existing CSS vars
 * where the shade already matches the design (core=blue accent, tests=green
 * ok, wiring=orange warn, boilerplate=gray info) — `docs` has no existing
 * purple token in `src/vendor/ui/styles.css`, so it's a literal hex, the same
 * house pattern `ReviewRunAccordion`'s `VERDICT_COLOR` already uses for a
 * meaning that doesn't map onto an existing token.
 */
export const ROLE_COLOR: Record<SmartDiffRole, string> = {
  core: "var(--accent)",
  tests: "var(--ok)",
  wiring: "var(--warn)",
  docs: "#a855f7",
  boilerplate: "var(--info)",
};

/** i18n keys (under `prReview.smartDiff`) for each role's label/subtitle. */
export const ROLE_LABEL_KEY: Record<SmartDiffRole, string> = {
  core: "coreLabel",
  tests: "testsLabel",
  wiring: "wiringLabel",
  docs: "docsLabel",
  boilerplate: "boilerplateLabel",
};

export const ROLE_SUBTITLE_KEY: Record<SmartDiffRole, string> = {
  core: "coreSubtitle",
  tests: "testsSubtitle",
  wiring: "wiringSubtitle",
  docs: "docsSubtitle",
  boilerplate: "boilerplateSubtitle",
};

/** Groups that start collapsed — everything else starts open (root plan
 *  step 8: "docs and boilerplate collapsed by default"). */
export const COLLAPSED_BY_DEFAULT: readonly SmartDiffRole[] = ["docs", "boilerplate"];
