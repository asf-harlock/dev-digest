/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

// ---- Intent classification (specs/03-intent-layer.md) ----------------------

/**
 * Fallback provider/model for the `review_intent` feature when the workspace
 * hasn't overridden it in Settings. MIRRORS `FEATURE_MODELS`'s `review_intent`
 * entry (contracts/platform.ts) — kept as a separate constant (not imported
 * from there) because the registry entry is a UI-facing default and this is
 * the classifier's own escape-hatch fallback (`getFeatureModelOverride` reads
 * `settings` directly rather than crossing into `modules/settings/`; see
 * `pull.repo.ts`). Cheap-by-default per D2: the feature's premise is a
 * SEPARATE, cheap model call.
 */
export const INTENT_FALLBACK_PROVIDER = 'openrouter' as const;
export const INTENT_FALLBACK_MODEL = 'deepseek/deepseek-v4-flash';

export const INTENT_SCHEMA_NAME = 'IntentClassification';
export const INTENT_MAX_RETRIES = 2;
export const INTENT_TIMEOUT_MS = 60_000;

// ---- Multi-agent review (specs/11-multi-agent-review.md) -------------------

/**
 * How many agents of one multi-agent run execute at once. `Infinity` = all of
 * them start together, so no agent waits for another (AC-14). A provider that
 * answers 429 to a burst is handled per agent (that column fails, EC-10); to
 * cap the fan-out, change this one value.
 */
export const MULTI_AGENT_CONCURRENCY = Infinity;

/** `POST /pulls/:id/multi-agent-run` rate limit — each call fans out to N LLM runs. */
export const MULTI_AGENT_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

/** Estimates are medians over an agent's last N `done` runs (AC-5). */
export const ESTIMATE_RUN_WINDOW = 5;

/** Finding kinds that describe a whole file, not a line range (AC-32). */
export const FILE_SCOPED_KINDS: readonly string[] = ['secret_leak', 'lethal_trifecta', 'phantom', 'hook'];

/** A finding spanning more than this many lines is treated as file-scoped (AC-32). */
export const FILE_SCOPED_SPAN_LINES = 50;

/** Max length of a take's `note` (first line of the rationale), ellipsis included (AC-34). */
export const NOTE_MAX_CHARS = 160;

/** Ellipsis appended to a truncated `note`. */
export const NOTE_ELLIPSIS = '…';

/** Statuses a column can carry (contract `AgentColumn.status`). */
export const COLUMN_STATUSES = ['running', 'done', 'failed', 'cancelled'] as const;
