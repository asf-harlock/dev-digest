import type { AgentSkillDetail, SkillSummary } from "@devdigest/shared";

/**
 * Appends the given (already-created) skill ids to an agent's linked set,
 * ordered after everything the agent already links, always attached ON.
 * Mirrors the Agent editor's Skills tab merge shape (server: D2/§5.2) —
 * duplicated locally rather than imported since a route may not reach into
 * another route's `_components/` (`pnpm arch`).
 */
export function appendSkillsToAgent(
  linked: AgentSkillDetail[],
  allSkills: SkillSummary[],
  skillIds: string[],
): AgentSkillDetail[] {
  const linkedIds = new Set(linked.map((sk) => sk.id));
  const toAdd = allSkills.filter((sk) => skillIds.includes(sk.id) && !linkedIds.has(sk.id));
  const appended: AgentSkillDetail[] = toAdd.map((sk, i) => ({
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
    order: linked.length + i,
    link_enabled: true,
  }));
  return [...linked, ...appended];
}
