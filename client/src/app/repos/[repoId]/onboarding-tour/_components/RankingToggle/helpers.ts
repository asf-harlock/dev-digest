import { MAX_WINDOW_DAYS, MIN_WINDOW_DAYS } from "./constants";

/** An integer in [MIN, MAX] from the raw input text, or null when invalid. */
export function parseWindowDays(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw);
  return n >= MIN_WINDOW_DAYS && n <= MAX_WINDOW_DAYS ? n : null;
}
