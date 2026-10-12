/**
 * How one linked skill is rendered into the prompt's `## Skills / rules` slot.
 *
 * Single source of the `### {name}\n{body}` block format, shared by the live
 * review run (`reviews/run-executor.ts`) and the eval run (`eval/executor.ts`)
 * so an eval run feeds the model byte-identical skill text. Pure — no I/O.
 */

export interface RenderableSkill {
  name: string;
  body: string;
}

export function renderSkillBlock(skill: RenderableSkill): string {
  return `### ${skill.name}\n${skill.body}`;
}
