import type { SkillType } from "@devdigest/shared";

/** Mirrors the Skills module's own type enum — duplicated rather than
 *  imported since a route may not reach into another route's constants. */
export const SKILL_TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
