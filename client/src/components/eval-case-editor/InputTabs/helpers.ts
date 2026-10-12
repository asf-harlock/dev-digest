import { INPUT_TABS, type InputTab } from "../constants";

/** The tab a Left / Right / Home / End key moves to, or null for any other key (WAI-ARIA tabs). */
export function nextTab(current: InputTab, key: string): InputTab | null {
  const i = INPUT_TABS.indexOf(current);
  if (key === "ArrowRight") return INPUT_TABS[(i + 1) % INPUT_TABS.length] ?? null;
  if (key === "ArrowLeft") return INPUT_TABS[(i - 1 + INPUT_TABS.length) % INPUT_TABS.length] ?? null;
  if (key === "Home") return INPUT_TABS[0] ?? null;
  if (key === "End") return INPUT_TABS[INPUT_TABS.length - 1] ?? null;
  return null;
}

export const tabId = (tab: InputTab): string => `case-tab-${tab}`;
export const panelId = (tab: InputTab): string => `case-panel-${tab}`;
