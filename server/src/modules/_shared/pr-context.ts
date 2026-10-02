/**
 * PR Context (SPEC-07) — the run-time resolver shared by the Context tab, the
 * review run executor, the brief and the intent classifier. In `_shared/` for
 * the same reason as `project-context.ts` (no module may import another's
 * files). It is a SEPARATE resolver: the SPEC-04 one is unchanged and keeps
 * reading agent/skill documents from the default-branch clone.
 *
 * Documents are read from git at `pull_requests.head_sha` through
 * `GitClient.readFileAtCommit` — never from the working tree. No LLM call is
 * made, and nothing here logs document text or raw git errors (UI-9, UI-10).
 */
import { createHash } from 'node:crypto';
import type { GitClient } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { detectInjectionPatterns } from './injection-detection.js';
import {
  PR_CONTEXT_TOKEN_BUDGET,
  PR_CONTEXT_TRUNCATION_FLOOR,
  checkRelativeShape,
  dedupePaths,
  kindForPath,
  sanitizePathForLog,
  type ContextKind,
} from './context-paths.js';
import { cloneDirExists } from './project-context.js';
import { computeContextFingerprint, truncateToBudget } from './pr-context-truncate.js';

const FULL_SHA = /^[0-9a-f]{40}$/;

/** The `source` label a PR-context document carries inside its `<untrusted>` block. */
export function prContextLabel(path: string): string {
  return `pr-context:${path}`;
}

/** Tokens of `text` as the prompt carries it: inside its `pr-context:` block. */
export function prWrappedTokenCount(tokenizer: Tokenizer, path: string, text: string): number {
  return tokenizer.count(wrapUntrusted(prContextLabel(path), text));
}

export type PrContextDocStatus =
  | 'attached'
  | 'truncated'
  | 'missing'
  | 'too_large'
  | 'unreadable'
  | 'over_budget';

export interface PrContextDoc {
  path: string;
  kind: ContextKind;
  /** Always `'pr'` — the origin recorded on trace entries. */
  origin: 'pr';
  status: PrContextDocStatus;
  /** Wrapped tokens: what was sent for attached/truncated; would-be for over_budget; 0 otherwise. */
  tokens: number;
  /** Text to send (marker included when truncated); '' unless attached/truncated. */
  text: string;
  /** Head SHA the document was read at; '' when never read. */
  sha: string;
  /** Git blob id at `sha`; null when never read. */
  blobId: string | null;
  /** Injection patterns detected live in the text (never stored). */
  warnings: string[];
}

/** Something worth a run-log line; rendered by `formatPrContextNote`. */
export type PrContextNote =
  | { kind: 'missing' | 'too_large' | 'unreadable' | 'over_budget' | 'truncated'; path: string }
  | { kind: 'injection'; path: string; patterns: string[] }
  | { kind: 'not_cloned' }
  | { kind: 'invalid_sha' }
  | { kind: 'fetch_failed' | 'fetch_timeout' };

export interface ResolvePrContextInput {
  git: Pick<GitClient, 'ensureCommit' | 'readFileAtCommit'>;
  tokenizer: Tokenizer;
  /** The PR's repo (for the clone location). */
  repo: { owner: string; name: string };
  /**
   * Absolute clone directory; null when the repo was never cloned. Pass the
   * result of `usableClonePath()` so a clone dir missing on disk reads as null.
   */
  clonePath: string | null;
  pr: {
    number: number;
    /** `pull_requests.head_sha` — must be 40 lowercase hex or no git command runs (EC-24). */
    headSha: string;
    /** `pull_requests.context_paths`, in saved order. */
    contextPaths: readonly string[];
  };
  /** Defaults to `PR_CONTEXT_TOKEN_BUDGET`. */
  budget?: number;
}

export interface ResolvedPrContext {
  /** One entry per attached path, in saved order (duplicates removed). */
  entries: PrContextDoc[];
  /** Entries with `status` `attached` or `truncated`, in prompt order. */
  sent: { path: string; text: string }[];
  /** Wrapped tokens actually sent (sum over `sent`). */
  tokensSent: number;
  /** The context fingerprint of this attached list; null when the list is empty. */
  fingerprint: string | null;
  notes: PrContextNote[];
}

/** `clonePath` if the directory exists on disk, else null (EC-1). */
export async function usableClonePath(clonePath: string | null): Promise<string | null> {
  if (!clonePath) return null;
  return (await cloneDirExists(clonePath)) ? clonePath : null;
}

function emptyDoc(path: string, status: PrContextDocStatus, sha = ''): PrContextDoc {
  return {
    path,
    kind: kindForPath(path),
    origin: 'pr',
    status,
    tokens: 0,
    text: '',
    sha,
    blobId: null,
    warnings: [],
  };
}

function finish(docs: PrContextDoc[], notes: PrContextNote[]): ResolvedPrContext {
  const sentDocs = docs.filter((d) => d.status === 'attached' || d.status === 'truncated');
  return {
    entries: docs,
    sent: sentDocs.map((d) => ({ path: d.path, text: d.text })),
    tokensSent: sentDocs.reduce((n, d) => n + d.tokens, 0),
    fingerprint: computeContextFingerprint(
      docs.map((d) => ({ path: d.path, blobId: d.blobId, status: d.status })),
    ),
    notes,
  };
}

/**
 * Resolve a PR's attached documents at its head SHA. Never throws for a bad
 * document or a failed fetch — each document lands in `entries` with its own
 * status (EC-1..7, EC-24). One `ensureCommit` pass; a `missing` document never
 * triggers another fetch (EC-4). Documents are admitted in saved order against
 * one budget (AC-17..19); a later document is still evaluated after an earlier
 * one was skipped (AC-19).
 */
export async function resolvePrContext(input: ResolvePrContextInput): Promise<ResolvedPrContext> {
  const notes: PrContextNote[] = [];
  const paths = dedupePaths(input.pr.contextPaths);
  if (paths.length === 0) return finish([], notes);

  const unreadableAll = (): ResolvedPrContext => {
    for (const p of paths) notes.push({ kind: 'unreadable', path: p });
    return finish(
      paths.map((p) => emptyDoc(p, 'unreadable')),
      notes,
    );
  };

  if (!input.clonePath) {
    notes.push({ kind: 'not_cloned' });
    return unreadableAll();
  }
  const sha = input.pr.headSha;
  if (!FULL_SHA.test(sha)) {
    notes.push({ kind: 'invalid_sha' });
    return unreadableAll();
  }

  let ensured: Awaited<ReturnType<GitClient['ensureCommit']>>;
  try {
    ensured = await input.git.ensureCommit(input.repo, sha, input.pr.number);
  } catch {
    ensured = { ok: false, reason: 'fetch_failed' };
  }
  if (!ensured.ok) {
    notes.push({ kind: ensured.reason === 'timeout' ? 'fetch_timeout' : 'fetch_failed' });
    return unreadableAll();
  }

  const reads = await Promise.all(
    paths.map(async (p) => {
      if (p.startsWith(':') || !checkRelativeShape(p).ok) return { ok: false as const, reason: 'not_found' as const };
      try {
        return await input.git.readFileAtCommit(input.repo, sha, p);
      } catch {
        return { ok: false as const, reason: 'fetch_failed' as const };
      }
    }),
  );

  const budget = input.budget ?? PR_CONTEXT_TOKEN_BUDGET;
  let used = 0;
  const docs: PrContextDoc[] = [];
  paths.forEach((path, i) => {
    const read = reads[i]!;
    if (!read.ok) {
      const status: PrContextDocStatus =
        read.reason === 'too_large'
          ? 'too_large'
          : read.reason === 'fetch_failed' || read.reason === 'not_utf8'
            ? 'unreadable'
            : 'missing';
      notes.push({ kind: status as 'missing' | 'too_large' | 'unreadable', path });
      docs.push(emptyDoc(path, status, sha));
      return;
    }
    const base = { ...emptyDoc(path, 'attached', sha), blobId: read.blobId };
    const warnings = detectInjectionPatterns(read.text, { ignoreCode: true }).patterns;
    const count = (t: string) => prWrappedTokenCount(input.tokenizer, path, t);
    const tokens = count(read.text);
    const remaining = budget - used;
    if (tokens <= remaining) {
      used += tokens;
      if (warnings.length > 0) notes.push({ kind: 'injection', path, patterns: warnings });
      docs.push({ ...base, tokens, text: read.text, warnings });
      return;
    }
    if (remaining >= PR_CONTEXT_TRUNCATION_FLOOR) {
      const cut = truncateToBudget(read.text, remaining, count);
      if (cut) {
        used += cut.tokens;
        notes.push({ kind: 'truncated', path });
        if (warnings.length > 0) notes.push({ kind: 'injection', path, patterns: warnings });
        docs.push({ ...base, status: 'truncated', tokens: cut.tokens, text: cut.text, warnings });
        return;
      }
    }
    notes.push({ kind: 'over_budget', path });
    docs.push({ ...base, status: 'over_budget', tokens, warnings });
  });

  return finish(docs, notes);
}

/** Run-log line for a note. Paths are sanitised here (UI-9); no git text ever reaches it (UI-10). */
export function formatPrContextNote(note: PrContextNote): string {
  switch (note.kind) {
    case 'missing':
      return `pr context: ${sanitizePathForLog(note.path)} missing at the head commit — skipped`;
    case 'too_large':
      return `pr context: ${sanitizePathForLog(note.path)} skipped — larger than 64 KB`;
    case 'unreadable':
      return `pr context: ${sanitizePathForLog(note.path)} skipped — unreadable`;
    case 'over_budget':
      return `pr context: ${sanitizePathForLog(note.path)} skipped — over the PR-context token budget`;
    case 'truncated':
      return `pr context: ${sanitizePathForLog(note.path)} truncated to fit the PR-context token budget`;
    case 'injection':
      return `pr context: ${sanitizePathForLog(note.path)} matches injection patterns (${note.patterns.join(', ')}) — attached as untrusted`;
    case 'not_cloned':
      return 'pr context: repository is not cloned — documents skipped';
    case 'invalid_sha':
      return 'pr context: the PR head commit is not a valid SHA — documents skipped';
    case 'fetch_failed':
      return 'pr context: the PR head commit could not be fetched — continuing without PR context';
    case 'fetch_timeout':
      return 'pr context: fetching the PR head commit timed out — continuing without PR context';
  }
}

/** Summary run-log line, e.g. `pr context: 2 doc(s) attached (+~1200 tokens)`. */
export function formatPrContextSummary(resolved: ResolvedPrContext): string {
  return `pr context: ${resolved.sent.length} doc(s) attached (+~${resolved.tokensSent} tokens)`;
}

/** Git blob id (SHA-1 of `blob <len>\0<bytes>`) of UTF-8 `text`. */
export function gitBlobId(text: string): string {
  const body = Buffer.from(text, 'utf8');
  return createHash('sha1')
    .update(`blob ${body.length}\0`)
    .update(body)
    .digest('hex');
}

/**
 * AC-24: a path attached both to the PR and to the agent / one of its enabled
 * skills is sent as the default-branch copy under its agent or skill origin,
 * and the PR copy only when its blob at the head SHA differs from the
 * default-branch blob. `projectDocs` are the SPEC-04 entries (any status; only
 * `attached` ones with the same path count). Returns the PR docs to send
 * (`kept`) and the ones dropped as identical (`dropped`); `kept` keeps order.
 * Only `attached`/`truncated` docs can be dropped; others pass through.
 */
export function dropPrDocsIdenticalToProject<T extends Pick<PrContextDoc, 'path' | 'status' | 'blobId'>>(
  prDocs: readonly T[],
  projectDocs: readonly { path: string; status: string; text: string }[],
): { kept: T[]; dropped: T[] } {
  const projectBlob = new Map<string, string>();
  for (const d of projectDocs) {
    if (d.status === 'attached' && !projectBlob.has(d.path)) projectBlob.set(d.path, gitBlobId(d.text));
  }
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const d of prDocs) {
    const sendable = d.status === 'attached' || d.status === 'truncated';
    if (sendable && d.blobId !== null && projectBlob.get(d.path) === d.blobId) dropped.push(d);
    else kept.push(d);
  }
  return { kept, dropped };
}
