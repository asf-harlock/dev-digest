import type { CiFailOn, CiInstallation } from "@devdigest/shared";

/** History size per installation (AC-40). */
export const HISTORY_LIMIT = 50;

/** Stable empty list so `useAutoRefreshCi` does not see a new array every render. */
export const NO_INSTALLATIONS: readonly CiInstallation[] = [];

/** Fail CI on segments, in display order (AC-41). Labels live in `ciTab.failOn.options`. */
export const FAIL_ON_VALUES: readonly CiFailOn[] = ["never", "critical", "warning", "any"];
