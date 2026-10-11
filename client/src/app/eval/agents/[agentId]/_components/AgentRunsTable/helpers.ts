/* Pure helpers for the Recent runs table. */

/** Max runs that can be compared at once. */
export const COMPARE_SIZE = 2;

/**
 * Toggles a run in the selection. Selecting a third run drops the one selected
 * longest ago, so the user is never stuck with a full selection and must uncheck first.
 */
export function toggleSelection(selected: string[], runId: string): string[] {
  if (selected.includes(runId)) return selected.filter((id) => id !== runId);
  return [...selected, runId].slice(-COMPARE_SIZE);
}
