import type { ConventionCategory } from '@devdigest/shared';

/** Constants for the conventions module (repo convention extraction). */

/** How many rank-ranked source files to sample per extraction. */
export const DEFAULT_SAMPLE_FILE_COUNT = 12;

/**
 * Well-known lint/format/TS config filenames probed at the repo root.
 * `repoIntel.getConventionSamples` deliberately EXCLUDES these (its `isJunkPath`
 * filter drops anything matching `.config.`/`eslint`/`prettier`), so this module
 * reads them itself, directly off the clone.
 */
export const CONFIG_FILENAMES = [
  '.eslintrc',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  'tsconfig.json',
  'tsconfig.base.json',
  '.prettierrc',
  '.prettierrc.js',
  '.prettierrc.json',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  'prettier.config.js',
  'prettier.config.mjs',
  'prettier.config.cjs',
] as const;

/**
 * Top-level directories `findConfigFiles` never descends into when probing
 * one level deep for a sub-package's config (a multi-package repo like this
 * one keeps `tsconfig.json`/`eslint.config.*` inside `server/`, `client/`, …
 * — never at the true root).
 */
export const CONFIG_SEARCH_SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'] as const;

/** Guard against a pathological config file bloating the prompt. */
export const MAX_CONFIG_FILE_BYTES = 50_000;

/** Guard against a pathological sampled source file bloating the prompt. */
export const MAX_SAMPLE_FILE_BYTES = 50_000;

/**
 * `conventions` keeps its own dynamic default rather than the static
 * `FEATURE_MODELS` registry default (see `settings/feature-models.ts`'s
 * `getFeatureModelOverride` doc comment) — a cheap model is the point of this
 * feature, so the fallback (when the workspace hasn't chosen one) is a cheap
 * one, not the registry's `gpt-5.4`.
 */
export const CONVENTIONS_FALLBACK_PROVIDER = 'openai' as const;
export const CONVENTIONS_FALLBACK_MODEL = 'gpt-4o-mini';

export const CONVENTIONS_SCHEMA_NAME = 'ConventionExtraction';
export const CONVENTIONS_MAX_RETRIES = 2;
export const CONVENTIONS_TIMEOUT_MS = 90_000;

// ---- Local (non-AI) extraction ---------------------------------------------

/** Which of `CONFIG_FILENAMES` a config file's basename belongs to. */
export type LocalConfigKind = 'prettier' | 'eslint' | 'tsconfig';

export interface LocalConventionRule {
  configKind: LocalConfigKind;
  /** Tested against each line of the config file's content. */
  pattern: RegExp;
  category: ConventionCategory;
  /** `%s` is replaced with the pattern's first capture group, if any. */
  rule: string;
}

/**
 * Deterministic rules for `helpers.ts#extractLocalCandidates` — no model call,
 * no execution of the config file, just a line-by-line regex match against a
 * fixed, curated set of well-known settings. Necessarily narrower than what the
 * AI extraction can find (it only knows these exact keys), but free, instant,
 * and never wrong about what the config actually says.
 */
export const LOCAL_CONVENTION_RULES: LocalConventionRule[] = [
  {
    configKind: 'prettier',
    pattern: /"?singleQuote"?\s*:\s*true/,
    category: 'style',
    rule: 'Use single quotes for strings.',
  },
  {
    configKind: 'prettier',
    pattern: /"?singleQuote"?\s*:\s*false/,
    category: 'style',
    rule: 'Use double quotes for strings.',
  },
  {
    configKind: 'prettier',
    pattern: /"?semi"?\s*:\s*false/,
    category: 'style',
    rule: 'Omit semicolons at the end of statements.',
  },
  {
    configKind: 'prettier',
    pattern: /"?semi"?\s*:\s*true/,
    category: 'style',
    rule: 'Always terminate statements with a semicolon.',
  },
  {
    configKind: 'prettier',
    pattern: /"?trailingComma"?\s*:\s*["']?(all|es5|none)["']?/,
    category: 'style',
    rule: 'Use trailing commas (%s) in multiline literals.',
  },
  {
    configKind: 'prettier',
    pattern: /"?tabWidth"?\s*:\s*(\d+)/,
    category: 'style',
    rule: 'Indent with %s spaces.',
  },
  {
    configKind: 'prettier',
    pattern: /"?printWidth"?\s*:\s*(\d+)/,
    category: 'style',
    rule: 'Keep lines under %s characters.',
  },
  {
    configKind: 'eslint',
    pattern: /["']no-console["']\s*:/,
    category: 'style',
    rule: 'Avoid `console.*` calls in committed code (ESLint `no-console`).',
  },
  {
    configKind: 'eslint',
    pattern: /["']quotes["']\s*:\s*\[[^\]]*["'](single|double)["']/,
    category: 'style',
    rule: 'Use %s quotes for strings (ESLint `quotes` rule).',
  },
  {
    configKind: 'tsconfig',
    pattern: /"strict"\s*:\s*true/,
    category: 'other',
    rule: 'TypeScript `strict` mode is enabled — no implicit `any`, strict null checks.',
  },
  {
    configKind: 'tsconfig',
    pattern: /"noUncheckedIndexedAccess"\s*:\s*true/,
    category: 'other',
    rule: 'Array/object index access is typed as possibly `undefined` (`noUncheckedIndexedAccess`).',
  },
];
