/**
 * PR Brief constants (SPEC-06). Every literal the layers share lives here:
 * caps, budgets, deadlines and the stable error strings.
 */
import type { FeatureModelId } from '@devdigest/shared';

export const BRIEF_FEATURE_ID: FeatureModelId = 'risk_brief';
export const BRIEF_PROMPT_FILE = 'brief.system.md';
export const BRIEF_SCHEMA_NAME = 'pr_brief';

/** AC-19: stored caps, first ones in model order. */
export const MAX_RISKS = 8;
export const MAX_FOCUS = 6;
/** EC-19: files whose stats and hunk headers reach the prompt. */
export const MAX_FILES = 200;

/** NFR-3: the whole model input. */
export const PROMPT_TOKEN_CAP = 16_000;
/**
 * Spec documents get a smaller share than the cap (PROJECT_CONTEXT_TOKEN_BUDGET
 * is the cap itself). A document that does not fit is skipped whole, so this
 * must hold one real spec: this repo's SPEC-04..06 run 6–10k tokens (D8).
 */
export const SPEC_DOCS_TOKEN_BUDGET = 10_000;

/** Per-input character caps so one huge author text cannot eat the budget. */
export const MAX_TITLE_CHARS = 500;
export const MAX_DESCRIPTION_CHARS = 8_000;
export const MAX_ISSUE_CHARS = 4_000;
export const MAX_INTENT_CHARS = 2_000;
export const MAX_BLAST_SYMBOLS = 50;
export const MAX_BLAST_CALLER_FILES = 100;

/** One overall model deadline; the lock is still held until the call settles. */
export const BRIEF_MODEL_DEADLINE_MS = 90_000;
/** Applies per HTTP attempt inside the adapter (`openai.ts` `timeoutMs`). */
export const BRIEF_ATTEMPT_TIMEOUT_MS = 30_000;
export const SCHEMA_RETRIES = 2;

export const GENERATE_STATUS_RUNNING = 'running' as const;

export const RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

export const ERROR_PULL_NOT_FOUND = 'Pull request not found';
export const ERROR_ALREADY_GENERATING = 'A brief is already being generated for this pull request';

/** Stable `last_error` strings. */
export const LAST_ERROR_NOT_CONFIGURED = 'Model not configured';
export const LAST_ERROR_TIMEOUT = 'Model call timed out';
export const LAST_ERROR_MODEL_FAILED = 'Model call failed or returned invalid output';
export const LAST_ERROR_GENERATE_FAILED = 'Brief generation failed';

export const OUTCOME_OK = 'ok';
export const OUTCOME_TIMEOUT = 'timeout';
export const OUTCOME_FAILED = 'failed';
