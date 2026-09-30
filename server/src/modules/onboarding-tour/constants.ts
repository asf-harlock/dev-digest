/**
 * Onboarding tour constants (SPEC-05). Every literal the layers share lives
 * here: budgets, the manifest list, and the honest status strings.
 */

/** Files fetched from the rank table to build facts (post junk-filter). */
export const RANKED_FILES_LIMIT = 2000;
export const CRITICAL_PATHS_LIMIT = 10;
export const READING_PATH_LIMIT = 8;
export const ARCHITECTURE_NODE_LIMIT = 8;
export const FIRST_TASKS_LIMIT = 3;
/** Directory depth (segments) a diagram node collapses a file path to. */
export const NODE_DEPTH = 2;

/** Manifest files read for run-locally facts (v1 list, Q8). */
export const MANIFEST_NAMES = [
  'package.json',
  'pnpm-workspace.yaml',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  '.env.example',
] as const;

/** Container directories whose children are scanned for package manifests. */
export const PACKAGE_CONTAINER_DIRS = ['packages', 'apps', 'services', 'libs'] as const;
export const MAX_PACKAGE_DIRS = 30;
export const MAX_MANIFEST_BYTES = 64 * 1024;

/** `package.json` scripts surfaced as commands, in display order. */
export const SCRIPT_ORDER = ['dev', 'start', 'build', 'test', 'lint'] as const;
export const SCRIPT_DESCRIPTIONS: Record<(typeof SCRIPT_ORDER)[number], string> = {
  dev: 'Start the development server',
  start: 'Start the application',
  build: 'Build the project',
  test: 'Run the test suite',
  lint: 'Run the linter',
};

export const LOCKFILE_MANAGERS = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
] as const;
export const DEFAULT_PACKAGE_MANAGER = 'npm';

/** Directory names that are safe to interpolate into a `cd <dir> && …` command. */
export const SAFE_DIR_RE = /^[A-Za-z0-9_@./-]+$/;

// ---- Status text (meta.degraded_reason) ----
export const REASON_NOT_CLONED = 'Repository is not cloned';
export const REASON_NO_INDEX = 'No index yet';
export const REASON_BY_INDEX: Record<string, string> = {
  flag_off: 'Repository indexing is turned off',
  index_failed: 'Indexing failed for this repository',
  index_partial: 'The index is partial',
  repo_too_large: 'Repository is too large to index',
  no_data: REASON_NO_INDEX,
};
export const REASON_INDEX_UNAVAILABLE = 'The repository index is unavailable';

/** EC-9: exact text, shown in the tour status when history could not be read. */
export const FALLBACK_ACTIVITY_UNAVAILABLE = 'Activity ranking unavailable — ranked by import graph';
/** EC-8: exact text; activity mode needs a local clone and is refused (422) without one. */
export const ERROR_ACTIVITY_NO_CLONE = 'No local clone — activity ranking unavailable';
/** History fetch + read budget (EC-9). */
export const HISTORY_BUDGET_MS = 60_000;
export const DEFAULT_WINDOW_DAYS = 180;

export const ARCHITECTURE_EMPTY_BODY = 'No structural facts are available for this repository yet.';
export const GENERATE_FAILED_MESSAGE = 'Tour generation failed';
export const ERROR_REPO_NOT_FOUND = 'Repo not found';
export const ERROR_ALREADY_GENERATING = 'A tour is already being generated for this repository';

export const GENERATE_STATUS_RUNNING = 'running' as const;

// ---- Model enrichment (slice 3) ----
export const TOUR_FEATURE_ID = 'onboarding' as const;
export const TOUR_PROMPT_FILE = 'onboarding.system.md';
export const TOUR_LANGUAGE = 'English';
export const TOUR_SCHEMA_NAME = 'OnboardingTourEnrichment';
/** Model call ceiling (Q10). The client gives up at 200 s, so no internal retries. */
export const TOUR_LLM_TIMEOUT_MS = 120_000;
export const TOUR_LLM_MAX_RETRIES = 0;
/** Token budget for the facts block, counted with the container tokenizer (Q-1). */
export const TOUR_TOKEN_BUDGET = 24_000;

/** Stable `meta.last_error` prefixes. The failure time is appended as ` (<ISO time>)`. */
export const LAST_ERROR_NOT_CONFIGURED = 'Model not configured';
export const LAST_ERROR_TIMEOUT = 'Model call timed out';
export const LAST_ERROR_MODEL_FAILED = 'Model call failed or returned invalid output';
export const NODE_ID_RE = /^[A-Za-z0-9_]{1,32}$/;
/** EC-7: exact text; the client matches `meta.degraded_reason` against it. */
export const REASON_MODEL_NOT_CONFIGURED = 'Model not configured';
