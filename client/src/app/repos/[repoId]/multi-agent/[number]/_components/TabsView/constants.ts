/** Tab id of an agent's tab / panel, derived from its run id. */
export const tabId = (runId: string): string => `agent-tab-${runId}`;
export const panelId = (runId: string): string => `agent-panel-${runId}`;
