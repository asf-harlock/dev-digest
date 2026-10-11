/**
 * SPEC-08 AC-49 — skill changes between two snapshotted skill lists. Pure.
 * Skills are matched by name. `changed` lists a skill present in both whose
 * body differs OR whose position among the skills common to both lists differs
 * (reordering). There is no separate `reordered` list.
 */

export interface SnapshotSkill {
  name: string;
  body: string;
}

export interface SkillsDiff {
  added: string[];
  removed: string[];
  changed: string[];
}

export function diffSkills(oldSkills: SnapshotSkill[], newSkills: SnapshotSkill[]): SkillsDiff {
  const oldByName = new Map(oldSkills.map((s) => [s.name, s]));
  const newByName = new Map(newSkills.map((s) => [s.name, s]));

  const added = newSkills.map((s) => s.name).filter((n) => !oldByName.has(n));
  const removed = oldSkills.map((s) => s.name).filter((n) => !newByName.has(n));

  const oldCommon = oldSkills.map((s) => s.name).filter((n) => newByName.has(n));
  const newCommon = newSkills.map((s) => s.name).filter((n) => oldByName.has(n));
  const changed = newCommon.filter(
    (name, idx) => oldByName.get(name)?.body !== newByName.get(name)?.body || oldCommon[idx] !== name,
  );

  return { added, removed, changed };
}
