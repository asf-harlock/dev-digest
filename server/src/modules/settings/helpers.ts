import type { Settings } from '@devdigest/shared';

/** A persisted settings key/value row (non-secret prefs). */
export interface SettingsRow {
  key: string;
  value: unknown;
}

/** Collapse key/value setting rows into a flat `Settings` object. A row
 *  whose value is `null` is skipped, so the key falls back to its default
 *  instead of reaching callers as an explicit null. */
export function rowsToSettings(rows: SettingsRow[]): Settings {
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    if (r.value === null) continue;
    out[r.key] = r.value;
  }
  return out as Settings;
}
