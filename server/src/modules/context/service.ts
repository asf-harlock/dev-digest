import type { Container } from '../../platform/container.js';
import type { ContextListing, SpecFile } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  cloneDirExists,
  readContextFile,
  scanContextFiles,
  wrappedTokenCount,
  type ContextFileRead,
} from '../_shared/project-context.js';
import { validateContextPath, type ContextRules } from '../_shared/context-paths.js';
import { ContextRepository, type ContextRepoRow } from './repository.js';
import { buildSpecFile, computeUsedBy } from './helpers.js';
import {
  CONTEXT_STATE_NOT_CLONED,
  CONTEXT_STATE_OK,
  MAX_CONTEXT_PREVIEW_BYTES,
  READ_BATCH,
  RESCAN_TIMEOUT_MS,
  RESCAN_WARNING_FETCH_FAILED,
  RESCAN_WARNING_TIMEOUT,
} from './constants.js';

/**
 * Project Context service — lists, previews and rescans the markdown documents
 * of a repo clone that can be attached to agents and skills (SPEC-04).
 * Tokens, injection flags and `used_by` are computed per request, never stored.
 */

/** Minimal request logger (pino-compatible: (obj, msg)). */
export type ContextLogger = { warn: (obj: unknown, msg?: string) => void };

/**
 * Per-repo in-memory mutex over `git sync`. Valid because there is a single API
 * instance (server/CLAUDE.md). A sync that outlives the Rescan timeout keeps
 * running; the next Rescan waits for it here instead of starting a second one.
 */
const syncTails = new Map<string, Promise<unknown>>();

/** Strip `user:token@` credentials a git error message could echo back. */
function redactCredentials(message: string): string {
  return message.replace(/\/\/[^@/\s]+@/g, '//***@');
}

export class ContextService {
  private repo: ContextRepository;

  constructor(private container: Container) {
    this.repo = new ContextRepository(container.db);
  }

  private get rules(): ContextRules {
    return { globs: this.container.config.contextGlobs, excludes: this.container.config.contextExcludes };
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<ContextRepoRow> {
    const row = await this.repo.getRepo(workspaceId, repoId);
    if (!row) throw new NotFoundError('Repo not found');
    return row;
  }

  async list(workspaceId: string, repoId: string): Promise<ContextListing> {
    const repo = await this.requireRepo(workspaceId, repoId);
    return this.buildListing(workspaceId, repo);
  }

  /**
   * One document with its `content`, for the preview drawer. Reads up to
   * `MAX_CONTEXT_PREVIEW_BYTES`, so a document too large to attach is still
   * previewable (it comes back `attachable: false`, `too_large`, WITH content).
   */
  async file(workspaceId: string, repoId: string, path: string): Promise<SpecFile> {
    const check = validateContextPath(path, this.rules);
    if (!check.ok) throw new ValidationError(check.reason);
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath || !(await cloneDirExists(repo.clonePath))) {
      throw new NotFoundError('Repository is not cloned');
    }
    const read = await readContextFile(repo.clonePath, path, MAX_CONTEXT_PREVIEW_BYTES);
    if (read.status === 'missing' || read.status === 'unreadable') {
      throw new NotFoundError('Document not found');
    }
    const usage = await this.usage(workspaceId);
    return buildSpecFile(
      { path, size: read.size, mtimeMs: read.mtimeMs },
      read,
      {
        tokens: read.status === 'ok' ? wrappedTokenCount(this.container.tokenizer, path, read.text) : null,
        usedBy: usage.get(path) ?? 0,
        includeContent: true,
      },
    );
  }

  /**
   * Bring the clone to the tip of the default branch (`git.sync`, NOT the
   * heavier repo-intel resync) and return the fresh listing. On a failed or
   * slow fetch the on-disk listing is returned with a `warning`.
   */
  async rescan(workspaceId: string, repoId: string, log?: ContextLogger): Promise<ContextListing> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) return this.buildListing(workspaceId, repo);

    const outcome = await this.syncWithTimeout(repo);
    if (outcome.kind === 'failed') {
      log?.warn(
        { repoId, err: redactCredentials(outcome.message) },
        'context rescan: git sync failed — serving on-disk listing',
      );
    } else if (outcome.kind === 'timeout') {
      log?.warn({ repoId }, 'context rescan: git sync timed out — serving on-disk listing');
    }
    const listing = await this.buildListing(workspaceId, repo);
    if (outcome.kind === 'failed') listing.warning = RESCAN_WARNING_FETCH_FAILED;
    if (outcome.kind === 'timeout') listing.warning = RESCAN_WARNING_TIMEOUT;
    return listing;
  }

  private async syncWithTimeout(
    repo: ContextRepoRow,
  ): Promise<{ kind: 'ok' } | { kind: 'failed'; message: string } | { kind: 'timeout' }> {
    const prev = syncTails.get(repo.id) ?? Promise.resolve();
    const run = prev.then(() =>
      this.container.git.sync({ owner: repo.owner, name: repo.name }, repo.defaultBranch),
    );
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    syncTails.set(repo.id, settled);
    void settled.then(() => {
      if (syncTails.get(repo.id) === settled) syncTails.delete(repo.id);
    });

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<{ kind: 'timeout' }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'timeout' }), RESCAN_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        run.then(
          () => ({ kind: 'ok' as const }),
          (err: unknown) => ({
            kind: 'failed' as const,
            message: err instanceof Error ? err.message : String(err),
          }),
        ),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async usage(workspaceId: string): Promise<Map<string, number>> {
    const [agents, links] = await Promise.all([
      this.repo.agentAttachments(workspaceId),
      this.repo.enabledSkillAttachments(workspaceId),
    ]);
    return computeUsedBy(agents, links);
  }

  private async buildListing(workspaceId: string, repo: ContextRepoRow): Promise<ContextListing> {
    const scannedAt = new Date().toISOString();
    if (!repo.clonePath || !(await cloneDirExists(repo.clonePath))) {
      return { files: [], total: 0, scanned_at: scannedAt, state: CONTEXT_STATE_NOT_CLONED };
    }
    const clonePath = repo.clonePath;
    const scan = await scanContextFiles(clonePath, this.rules);
    const usage = await this.usage(workspaceId);

    const files: SpecFile[] = [];
    for (let i = 0; i < scan.files.length; i += READ_BATCH) {
      const batch = scan.files.slice(i, i + READ_BATCH);
      const reads: ContextFileRead[] = await Promise.all(
        batch.map((f) => readContextFile(clonePath, f.path)),
      );
      batch.forEach((f, j) => {
        const read = reads[j]!;
        files.push(
          buildSpecFile(f, read, {
            tokens: read.status === 'ok' ? wrappedTokenCount(this.container.tokenizer, f.path, read.text) : null,
            usedBy: usage.get(f.path) ?? 0,
            includeContent: false,
          }),
        );
      });
    }
    return { files, total: scan.total, scanned_at: scannedAt, state: CONTEXT_STATE_OK };
  }
}
