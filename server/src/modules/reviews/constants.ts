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
