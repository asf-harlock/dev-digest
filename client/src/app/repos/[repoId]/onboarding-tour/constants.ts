import type { IconName } from "@devdigest/ui";
import type { TourSectionKind } from "@devdigest/shared";

export interface SectionDef {
  kind: TourSectionKind;
  /** Anchor id (URL hash) and DOM id of the section. */
  id: string;
  /** Key under `onboarding.tour.sections`. */
  titleKey: string;
  icon: IconName;
}

/** Render order (AC-3). The five sections are fixed. */
export const SECTION_DEFS: readonly SectionDef[] = [
  { kind: "architecture", id: "architecture", titleKey: "architecture", icon: "Boxes" },
  { kind: "critical_paths", id: "critical-paths", titleKey: "criticalPaths", icon: "Activity" },
  { kind: "run_locally", id: "run-locally", titleKey: "runLocally", icon: "Command" },
  { kind: "reading_path", id: "reading-path", titleKey: "readingPath", icon: "ListChecks" },
  { kind: "first_tasks", id: "first-tasks", titleKey: "firstTasks", icon: "Target" },
];

/** `meta.degraded_reason` the server writes when no provider key is configured (EC-7). */
export const REASON_MODEL_NOT_CONFIGURED = "Model not configured";
/** Settings → Feature Models. */
export const SETTINGS_MODELS_HREF = "/settings/models";
