import type { Agent, RunSummary } from "@devdigest/shared";

/** Ids of the checked agents. `selection === null` means "untouched": enabled agents are checked (AC-2). */
export function checkedAgentIds(
  agents: readonly Pick<Agent, "id" | "enabled">[],
  selection: ReadonlySet<string> | null,
): string[] {
  return agents.filter((a) => (selection ? selection.has(a.id) : a.enabled)).map((a) => a.id);
}

/** Flip one id in the selection, starting from the untouched default when needed. */
export function toggleAgent(
  agents: readonly Pick<Agent, "id" | "enabled">[],
  selection: ReadonlySet<string> | null,
  id: string,
): Set<string> {
  const next = new Set(checkedAgentIds(agents, selection));
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * A grouped run of this PR still has a child `running` (EC-25, AC-47). Standalone single-agent
 * runs have no `multi_agent_run_id` and never block a new grouped run.
 */
export function hasRunningMultiAgentChild(runs: readonly RunSummary[] | undefined): boolean {
  return (runs ?? []).some((r) => !!r.multi_agent_run_id && r.status === "running");
}
