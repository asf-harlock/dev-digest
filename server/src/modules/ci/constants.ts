/**
 * SPEC-11 Export to CI — every literal of the `ci` module lives here.
 */
import type { CiErrorCode } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// Generated workflow (AC-21..AC-27)
// ---------------------------------------------------------------------------

/** The only repository path the workflow is ever written to (UI-3). */
export const WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
/** Workflow `name:`; with `WORKFLOW_JOB_ID` it forms the check name `DevDigest Review / review`. */
export const WORKFLOW_NAME = 'DevDigest Review';
export const WORKFLOW_JOB_ID = 'review';
export const WORKFLOW_RUNS_ON = 'ubuntu-latest';
export const WORKFLOW_JOB_TIMEOUT_MINUTES = 15;
/** Generator version (integer). Bump when the generated workflow or file layout changes. */
export const WORKFLOW_VERSION = 1;
/** Mentioned in the workflow header comment only (AC-27) — never referenced as a `uses:`. */
export const WORKFLOW_HEADER_ACTION_REF = 'devdigest/review-action@v1';

/** Branch every export commits to; never the default branch (AC-12, AC-17). */
export const CI_BRANCH = 'devdigest/ci';

export const NODE_VERSION = '22';

/** Third-party actions, pinned by full commit SHA (NFR-7). `version` is shown as a trailing comment. */
export const PINNED_ACTIONS = {
  checkout: {
    uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
    version: 'v4.4.0',
  },
  setupNode: {
    uses: 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
    version: 'v4.4.0',
  },
  uploadArtifact: {
    uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
    version: 'v4.6.2',
  },
} as const;

/** Chosen triggers are emitted in this canonical order (AC-21, NFR-5). */
export const TRIGGER_ORDER = ['opened', 'synchronize', 'reopened'] as const;

// ---------------------------------------------------------------------------
// Exported files (AC-28..AC-31)
// ---------------------------------------------------------------------------

export const DEVDIGEST_DIR = '.devdigest';
export const MANIFEST_DIR = '.devdigest/agents';
export const SKILLS_DIR = '.devdigest/skills';
export const MEMORY_PATH = '.devdigest/memory.jsonl';
export const RUNNER_DIR = '.devdigest/runner';
/** The step runs `node <RUNNER_ENTRYPOINT>` (AC-24). */
export const RUNNER_ENTRYPOINT = '.devdigest/runner/index.js';
/** Files the runner dist must contain; without either the bundle is unusable (W0 gate). */
export const RUNNER_REQUIRED_FILES = ['index.js', 'package.json'] as const;

export const OPENROUTER_SECRET_NAME = 'OPENROUTER_API_KEY';
/** Written by the runner next to the working directory. */
export const RESULT_FILENAME = 'devdigest-result.json';
/** Written by the fixed sidecar step of the workflow (AC-25). */
export const RUN_META_FILENAME = 'devdigest-run.json';
export const ARTIFACT_NAME = 'devdigest-result';

/** The sidecar step script — fixed text; values reach it only through `env:` (UI-7). */
export const SIDECAR_SCRIPT =
  `printf '{"commit_sha":"%s","repository":"%s","pr_number":%s}\\n' ` +
  `"$DEVDIGEST_COMMIT_SHA" "$DEVDIGEST_REPOSITORY" "$DEVDIGEST_PR_NUMBER" > ${RUN_META_FILENAME}`;

export const MANIFEST_SLUG_FALLBACK = 'agent';
export const SKILL_SLUG_FALLBACK = 'skill';

export const PREVIEW_NOTE_MEMORY_EMPTY = 'empty';
export const PREVIEW_NOTE_RUNNER = 'bundled runner (read-only)';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const SLUG_MAX_LENGTH = 64;
export const MEMORY_MAX_ROWS = 500;
export const WORKFLOW_MAX_BYTES = 64 * 1024;
export const REFRESH_RUNS_LIMIT = 30;
export const RUN_HISTORY_LIMIT = 50;
export const RUNS_LIST_MAX = 200;
export const STALE_RUN_MS = 24 * 60 * 60 * 1000;
export const ERROR_TEXT_MAX = 200;

/** Safe-unzip limits (EC-20, UI-8). */
export const ARTIFACT_MAX_ENTRIES = 64;
export const ARTIFACT_MAX_ENTRY_BYTES = 256 * 1024;
export const ARTIFACT_MAX_COMPRESSED_BYTES = 16 * 1024 * 1024;

/** Numeric bounds applied to a forgeable artifact (UI-8). */
export const ARTIFACT_MAX_FINDINGS = 10_000;
export const ARTIFACT_MAX_COST_USD = 1_000;
export const ARTIFACT_MAX_DURATION_MS = 24 * 60 * 60 * 1000;

/** Refresh behaviour (AC-53, AC-54, NFR-9, NFR-10). */
export const REFRESH_DEBOUNCE_MS = 30_000;
export const AUTO_REFRESH_MS = 60_000;
export const REFRESH_CONCURRENCY = 5;
export const REFRESH_DEADLINE_MS = 50_000;
export const COMMIT_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// GitHub run ingest
// ---------------------------------------------------------------------------

export const WORKFLOW_EVENT = 'pull_request';
/** Completed-run conclusions that become a CI run (AC-57); `skipped` is ignored (EC-36). */
export const INGESTED_CONCLUSIONS = ['success', 'failure', 'cancelled', 'timed_out'] as const;
export type IngestedConclusion = (typeof INGESTED_CONCLUSIONS)[number];
export const GITHUB_WEB_ORIGIN = 'https://github.com';
/** `owner/name` as GitHub spells it. */
export const REPO_FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** Token shapes scrubbed from any text that may reach a response or a log (NFR-12). */
export const SECRET_PATTERNS: readonly RegExp[] = [
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bsk-or-[A-Za-z0-9_-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
];
export const REDACTED = '[redacted]';

// ---------------------------------------------------------------------------
// Pull request text
// ---------------------------------------------------------------------------

export const PR_TITLE = 'Add DevDigest CI review';
export const COMMIT_MESSAGE = 'Add DevDigest CI review';

// ---------------------------------------------------------------------------
// Errors (`error.code`) — see `CiErrorCode` in the shared contract
// ---------------------------------------------------------------------------

export const CI_ERROR = {
  githubTokenMissing: 'github_token_missing',
  githubPermission: 'github_permission',
  runnerBundleMissing: 'runner_bundle_missing',
  unsupportedTarget: 'unsupported_target',
  repoTaken: 'ci_repo_taken',
  exportRunning: 'ci_export_running',
  refreshRunning: 'ci_refresh_running',
  rateLimited: 'rate_limited',
  prFailed: 'ci_pr_failed',
  noChanges: 'ci_no_changes',
  refreshTimeout: 'refresh_timeout',
  ingestFailed: 'ingest_failed',
} as const satisfies Record<string, CiErrorCode>;

/** HTTP status per code. */
export const CI_ERROR_STATUS: Record<CiErrorCode, number> = {
  github_token_missing: 409,
  github_permission: 403,
  runner_bundle_missing: 409,
  unsupported_target: 422,
  ci_repo_taken: 409,
  ci_export_running: 409,
  ci_refresh_running: 409,
  rate_limited: 429,
  ci_pr_failed: 502,
  ci_no_changes: 409,
  refresh_timeout: 504,
  ingest_failed: 500,
};

/** API message per code; the client keys its own copy off `code`. */
export const CI_ERROR_MESSAGE: Record<CiErrorCode, string> = {
  github_token_missing: 'No GitHub token is stored. Add one in Settings → API Keys.',
  github_permission:
    'GitHub rejected the request. The token needs Contents, Pull requests and Workflows (write) for a fine-grained token, or repo and workflow for a classic token.',
  runner_bundle_missing: 'The CI runner is not built. Run `pnpm --dir agent-runner build`.',
  unsupported_target: 'Only the GitHub Actions target is supported.',
  ci_repo_taken: 'This repository already has a CI installation of another agent.',
  ci_export_running: 'An export for this repository is already running.',
  ci_refresh_running: 'A refresh for this installation is already running.',
  rate_limited: 'GitHub rate limit reached. Try again after the reset time.',
  ci_pr_failed: 'The files were committed but opening the pull request failed.',
  ci_no_changes: 'The repository already contains these files',
  refresh_timeout: 'The refresh did not finish in time. Stored results are unchanged.',
  ingest_failed: 'Ingesting the workflow runs failed.',
};

/** HTTP status the adapter records in `github_permission` details for a missing repository/resource. */
export const HTTP_NOT_FOUND = 404;

export const ARTIFACT_REJECTED = 'artifact_rejected' as const;

export const WORKFLOW_ERROR_NOT_YAML = 'The workflow is not valid YAML';
export const WORKFLOW_ERROR_TOO_LARGE = `The workflow is larger than ${WORKFLOW_MAX_BYTES / 1024} KiB`;
export const MANIFEST_ERROR_INVALID = 'The generated agent manifest is invalid';
