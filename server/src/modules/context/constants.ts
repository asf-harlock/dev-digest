/**
 * Project Context module constants (SPEC-04). The limits shared with the run
 * resolver live in `_shared/context-paths.ts` and are re-exported here so this
 * module has one place to read them from.
 */
export {
  MAX_CONTEXT_FILE_BYTES,
  MAX_CONTEXT_PREVIEW_BYTES,
  MAX_CONTEXT_LISTING_FILES,
  PROJECT_CONTEXT_TOKEN_BUDGET,
} from '../_shared/context-paths.js';

/** Read this many documents at once while building a listing. */
export const READ_BATCH = 20;

/** How long a Rescan waits for `git sync` before serving the on-disk listing. */
export const RESCAN_TIMEOUT_MS = 30_000;

export const CONTEXT_STATE_OK = 'ok' as const;
export const CONTEXT_STATE_NOT_CLONED = 'not_cloned' as const;

export const RESCAN_WARNING_FETCH_FAILED = 'fetch_failed' as const;
export const RESCAN_WARNING_TIMEOUT = 'timeout' as const;
