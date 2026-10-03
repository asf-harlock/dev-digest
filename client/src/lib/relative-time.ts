"use client";

import { useFormatter, useNow } from "next-intl";

/** How often a mounted relative time re-renders ("2 minutes ago" → "3 minutes ago"). */
const TICK_MS = 60_000;

/**
 * `format.relativeTime` against the real current time. Without an explicit
 * `now`, next-intl measures from the `now` the server provider froze at page
 * load, so anything that happened after the page loaded (a failure landing
 * via polling) renders in the future: "in 3 minutes".
 */
export function useRelativeTime(): (date: Date | string) => string {
  const format = useFormatter();
  const tick = useNow({ updateInterval: TICK_MS });
  return (date) => {
    const now = new Date(Math.max(tick.getTime(), Date.now()));
    return format.relativeTime(new Date(date), now);
  };
}
