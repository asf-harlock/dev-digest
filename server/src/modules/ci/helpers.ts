import type { CiFailOn, CiRunStatus, Verdict } from '@devdigest/shared';
import {
  ERROR_TEXT_MAX,
  GITHUB_WEB_ORIGIN,
  MANIFEST_SLUG_FALLBACK,
  REDACTED,
  REPO_FULL_NAME_RE,
  RUNNER_DIR,
  SECRET_PATTERNS,
  SLUG_MAX_LENGTH,
  WORKFLOW_EVENT,
  WORKFLOW_PATH,
  type IngestedConclusion,
} from './constants.js';

/**
 * Pure helpers for the `ci` module (SPEC-12). No I/O, no DB, no container.
 */

// ---------------------------------------------------------------------------
// Slugs (UI-2, EC-15)
// ---------------------------------------------------------------------------

/**
 * Derive a file-safe slug: `[a-z0-9-]`, at most 64 chars, never empty, no leading
 * dot or path separator (those characters are simply not in the alphabet).
 */
export function slugify(name: string, fallback: string = MANIFEST_SLUG_FALLBACK): string {
  const base = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
  return base === '' ? fallback : base;
}

/**
 * Slugs for a list of names, in order; a later name that collides with an
 * earlier slug gets `-2`, `-3`, … so every file path is unique (EC-15).
 */
export function uniqueSlugs(names: readonly string[], fallback: string = MANIFEST_SLUG_FALLBACK): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    const base = slugify(name, fallback);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) {
      const suffix = `-${n}`;
      slug = `${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
    }
    taken.add(slug);
    return slug;
  });
}

/** Repository path of a runner file given its dist-relative path. */
export function runnerRepoPath(relPath: string): string {
  return `${RUNNER_DIR}/${relPath}`;
}

// ---------------------------------------------------------------------------
// Gate, verdict, status (AC-47, AC-59, AC-60)
// ---------------------------------------------------------------------------

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

/** Number of findings that meet the gate; mirrors reviewer-core `countBlockers`. `never` is always 0. */
export function severityBlockers(counts: SeverityCounts, failOn: CiFailOn): number {
  switch (failOn) {
    case 'never':
      return 0;
    case 'critical':
      return counts.critical;
    case 'warning':
      return counts.critical + counts.warning;
    case 'any':
      return counts.critical + counts.warning + counts.suggestion;
  }
}

/**
 * Verdict derived on the server (AC-47): request changes when at least one
 * finding meets the threshold, approve when there are no findings, else comment.
 */
export function deriveVerdict(
  counts: SeverityCounts & { findings_count: number },
  failOn: CiFailOn,
): Verdict {
  if (severityBlockers(counts, failOn) > 0) return 'request_changes';
  if (counts.findings_count === 0) return 'approve';
  return 'comment';
}

/**
 * Run status of a COMPLETED run (AC-59). A run whose artifact failed
 * verification is `failed` regardless of the conclusion.
 */
export function deriveRunStatus(input: {
  conclusion: IngestedConclusion;
  artifactOk: boolean;
  findingsCount: number | null;
}): Exclude<CiRunStatus, 'running'> {
  if (!input.artifactOk || input.conclusion !== 'success') return 'failed';
  return input.findingsCount === 0 ? 'no_findings' : 'succeeded';
}

// ---------------------------------------------------------------------------
// Links (UI-11, UI-12)
// ---------------------------------------------------------------------------

/**
 * A GitHub `html_url` may become a link only when it is an https github.com URL
 * that points at `/<repository>/actions/runs/…` (UI-11).
 */
export function isTrustedJobUrl(url: string | null | undefined, repo: string): boolean {
  if (!url || !REPO_FULL_NAME_RE.test(repo)) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (`${parsed.protocol}//${parsed.host}` !== GITHUB_WEB_ORIGIN) return false;
  if (parsed.username !== '' || parsed.password !== '') return false;
  return parsed.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/actions/runs/`);
}

/** `https://github.com/<repo>/pull/<n>`, or null when `repo`/`n` are not well-formed (UI-12). */
export function prUrl(repo: string, n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n <= 0) return null;
  if (!REPO_FULL_NAME_RE.test(repo)) return null;
  return `${GITHUB_WEB_ORIGIN}/${repo}/pull/${n}`;
}

// ---------------------------------------------------------------------------
// GitHub errors (UI-13, NFR-12)
// ---------------------------------------------------------------------------

/**
 * Plain text for a GitHub error body: tokens removed (known shapes plus any
 * explicit `secrets`), whitespace collapsed, at most 200 characters.
 */
export function truncateGithubError(text: unknown, secrets: readonly string[] = []): string {
  let out = typeof text === 'string' ? text : text == null ? '' : String(text);
  for (const secret of secrets) {
    if (secret.length >= 4) out = out.split(secret).join(REDACTED);
  }
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, REDACTED);
  out = out.replace(/\s+/g, ' ').trim();
  return out.length > ERROR_TEXT_MAX ? `${out.slice(0, ERROR_TEXT_MAX - 1)}…` : out;
}

// ---------------------------------------------------------------------------
// Run origin (UI-10)
// ---------------------------------------------------------------------------

/** GitHub may report `path` as `<file>@<ref>`; compare without the suffix. */
export function stripWorkflowRef(path: string): string {
  const at = path.indexOf('@');
  return at === -1 ? path : path.slice(0, at);
}

/**
 * True when a workflow run really is a run of our generated workflow on a
 * pull request of the installation's own repository (not a fork).
 */
export function isExpectedWorkflowRun(
  run: { event: string; path: string; head_repository_full_name: string | null },
  installationRepo: string,
): boolean {
  return (
    run.event === WORKFLOW_EVENT &&
    stripWorkflowRef(run.path) === WORKFLOW_PATH &&
    run.head_repository_full_name !== null &&
    run.head_repository_full_name.toLowerCase() === installationRepo.toLowerCase()
  );
}
