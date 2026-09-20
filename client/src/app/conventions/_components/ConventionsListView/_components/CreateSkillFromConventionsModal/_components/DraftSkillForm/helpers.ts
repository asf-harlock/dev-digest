import type { SkillType } from "@devdigest/shared";

export function formatSkillTypeLabel(type: SkillType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
