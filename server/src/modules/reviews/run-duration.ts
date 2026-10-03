import prettyMs from 'pretty-ms';

/**
 * Human-readable duration of a review run, for the run history list
 * (e.g. "12.4s", or "12 seconds 400 milliseconds" in verbose mode).
 */
export function formatRunDuration(
  startedAt: Date,
  finishedAt: Date | null,
  opts: { verbose?: boolean } = {},
): string {
  const elapsedMs = startedAt.getTime() - (finishedAt ?? new Date()).getTime();
  return prettyMs(elapsedMs, { verbose: opts.verbose ?? false });
}
