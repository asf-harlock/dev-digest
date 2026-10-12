import type { EvalSkillCarrier } from "@devdigest/shared";

/** Carrier choices in the order the picker lists them: by name, then id for a stable tie. */
export function sortCarriers(carriers: readonly EvalSkillCarrier[]): EvalSkillCarrier[] {
  return [...carriers].sort(
    (a, b) => a.name.localeCompare(b.name) || a.agent_id.localeCompare(b.agent_id),
  );
}

/**
 * The carrier the picker shows (AC-20): the user's choice while it is still offered,
 * else the carrier of the skill's latest run while it is still linked, else the first
 * agent by name. `null` only when the skill has no linked agent.
 */
export function selectedCarrierId(
  sorted: readonly EvalSkillCarrier[],
  chosen: string | null,
  latestCarrierId: string | null | undefined,
): string | null {
  const has = (id: string | null | undefined): id is string =>
    !!id && sorted.some((c) => c.agent_id === id);
  if (has(chosen)) return chosen;
  if (has(latestCarrierId)) return latestCarrierId;
  return sorted[0]?.agent_id ?? null;
}

/** EC-46: the skill itself or its link to the chosen carrier is switched off. */
export function isSkillOrLinkDisabled(
  skillEnabled: boolean,
  carrier: Pick<EvalSkillCarrier, "link_enabled"> | undefined,
): boolean {
  return !skillEnabled || (carrier !== undefined && !carrier.link_enabled);
}
