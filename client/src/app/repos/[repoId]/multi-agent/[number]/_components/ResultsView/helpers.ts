import type { AgentColumn, MultiAgentRun } from "@devdigest/shared";

/** The column the `?trace=` deep link points at; a run id that is not a column of the
 *  shown run is ignored (AC-45) — never open a drawer for someone else's run. */
export function traceColumn(run: MultiAgentRun | null | undefined, traceId: string | null): AgentColumn | null {
  if (!run || !traceId) return null;
  return run.columns.find((c) => c.run_id === traceId) ?? null;
}

/** Columns whose status differs from the last seen one (for the aria-live announcement). */
export function statusChanges(prev: ReadonlyMap<string, string>, columns: AgentColumn[]): AgentColumn[] {
  return columns.filter((c) => prev.has(c.run_id) && prev.get(c.run_id) !== c.status);
}

export function statusMap(columns: AgentColumn[]): Map<string, string> {
  return new Map(columns.map((c) => [c.run_id, c.status]));
}

/** `…/multi-agent/:number` with `changes` applied to the current query (null removes a param). */
export function withParams(
  path: string,
  current: URLSearchParams,
  changes: Record<string, string | null>,
): string {
  const sp = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(changes)) {
    if (v == null) sp.delete(k);
    else sp.set(k, v);
  }
  const q = sp.toString();
  return q ? `${path}?${q}` : path;
}
