import type { AgentSkillDetail, SkillSummary, SkillType } from "@devdigest/shared";

/** A stable accent colour per skill type, for the row's type badge. */
export function typeColor(type: SkillType): string {
  switch (type) {
    case "security":
      return "var(--crit)";
    case "rubric":
      return "var(--accent)";
    case "convention":
      return "var(--ok)";
    default:
      return "var(--text-secondary)";
  }
}

/** The paired background token for `typeColor` — `color + "1a"` does not work
 * on a `var(--x)` reference (it produces the invalid CSS `var(--x)1a`, which
 * the browser silently drops); the design system's own tinted `-bg` tokens
 * are the real pairing. */
export function typeBg(type: SkillType): string {
  switch (type) {
    case "security":
      return "var(--crit-bg)";
    case "rubric":
      return "var(--accent-bg)";
    case "convention":
      return "var(--ok-bg)";
    default:
      return "var(--bg-hover)";
  }
}

/** Every workspace skill, not just the ones already linked to this agent (spec
 *  02-skills.md D2: "the mockup lists all six workspace skills … that is only
 *  coherent if a row can be present-but-off"). Linked skills keep their real
 *  `order`/`link_enabled`; every other workspace skill is appended, unlinked,
 *  in the position it will take if the user attaches it. */
export function mergeSkillsForAgent(
  all: SkillSummary[],
  linked: AgentSkillDetail[],
): AgentSkillDetail[] {
  const linkedIds = new Set(linked.map((sk) => sk.id));
  const ordered = linked.slice().sort((a, b) => a.order - b.order);
  const unlinked: AgentSkillDetail[] = all
    .filter((sk) => !linkedIds.has(sk.id))
    .map((sk, i) => ({
      id: sk.id,
      name: sk.name,
      description: sk.description,
      type: sk.type,
      source: sk.source,
      body: sk.body,
      enabled: sk.enabled,
      version: sk.version,
      evidence_files: sk.evidence_files,
      token_estimate: sk.token_estimate,
      injection_flagged: sk.injection_flagged,
      injection_patterns: sk.injection_patterns,
      order: ordered.length + i,
      link_enabled: false,
    }));
  return [...ordered, ...unlinked];
}

/** Case-insensitive filter over a skill's name + type. Order is untouched —
 *  filtering never reorders, it only hides rows. */
export function filterSkills(skills: AgentSkillDetail[], query: string): AgentSkillDetail[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.type}`.toLowerCase().includes(q));
}

/** Move the skill one slot up (-1) or down (+1) in the FULL ordered list.
 *  Returns undefined at either boundary or an unknown id — nothing to submit. */
export function moveSkill(
  skills: AgentSkillDetail[],
  id: string,
  direction: -1 | 1,
): AgentSkillDetail[] | undefined {
  const from = skills.findIndex((sk) => sk.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= skills.length) return undefined;
  const next = skills.slice();
  const moved = next[from];
  if (!moved) return undefined;
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Move `draggedId` to just before `targetId` in the FULL ordered list
 *  (native HTML5 drag-and-drop, the ↑/↓ buttons' pointer-driven sibling). */
export function reorderByDrag(
  skills: AgentSkillDetail[],
  draggedId: string,
  targetId: string,
): AgentSkillDetail[] | undefined {
  if (draggedId === targetId) return undefined;
  const from = skills.findIndex((sk) => sk.id === draggedId);
  if (from < 0) return undefined;
  const next = skills.slice();
  const moved = next[from];
  if (!moved) return undefined;
  next.splice(from, 1);
  const to = next.findIndex((sk) => sk.id === targetId);
  next.splice(to < 0 ? next.length : to, 0, moved);
  return next;
}
