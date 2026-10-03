/** Fixed row height — the loading skeleton uses the same value so the list
 *  does not jump when data arrives (EC-19). */
export const ROW_HEIGHT = 48;

export const SKELETON_ROWS = 6;

/** Mirrors the server's `MAX_CONTEXT_FILE_BYTES`: largest document an agent or skill can attach. */
export const ATTACH_LIMIT_KB = 64;
/** Mirrors the server's `MAX_CONTEXT_PREVIEW_BYTES`: largest document the preview reads. */
export const PREVIEW_LIMIT_KB = 256;

/** Wrapped project context is capped at this many tokens per run (EC-12). */
export const TOKEN_BUDGET = 16_000;

/** Kind chip colours; the chip always carries its text label as well. */
export const KIND_COLORS = {
  specs: { color: "var(--accent-text)", bg: "var(--accent-bg, var(--bg-hover))" },
  docs: { color: "var(--text-secondary)", bg: "var(--bg-hover)" },
  insights: { color: "var(--ok)", bg: "var(--ok-bg)" },
} as const;

export const DEFAULT_KIND = "docs" as const;
