import type {
  PrContextPreview,
  PrContextResponse,
  PrContextEntry,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  MAX_PR_CONTEXT_PATHS,
  PR_CONTEXT_MAX_FILE_BYTES,
  PR_CONTEXT_TOKEN_BUDGET,
  dedupePaths,
  kindForPath,
  type ContextRules,
} from '../_shared/context-paths.js';
import { readContextFile, scanContextFiles, wrappedTokenCount } from '../_shared/project-context.js';
import {
  buildAttachableList,
  changedStatusMap,
  originFor,
  computeSuggestions,
  validatePrContextPath,
} from '../_shared/pr-context-paths.js';
import { resolvePrContext, usableClonePath, type PrContextDoc } from '../_shared/pr-context.js';
import { PullsRepository, type PullRepoRow, type PullRow } from './repository.js';

/** Largest budget, so a preview is never truncated by the PR-context budget. */
const NO_BUDGET = Number.MAX_SAFE_INTEGER;

/**
 * PR Context service (SPEC-07) — the Context tab's list, save and preview.
 * Reads documents at the PR head SHA through `resolvePrContext`; saving writes
 * only `pull_requests.context_paths` and starts no brief, intent or run (AC-41).
 */
export class PrContextService {
  private repo: PullsRepository;

  constructor(private container: Container) {
    this.repo = new PullsRepository(container.db);
  }

  private get rules(): ContextRules {
    return { globs: this.container.config.contextGlobs, excludes: this.container.config.contextExcludes };
  }

  private async require(workspaceId: string, prId: string): Promise<{ pr: PullRow; repo: PullRepoRow }> {
    const row = await this.repo.getPullWithRepo(workspaceId, prId);
    if (!row) throw new NotFoundError('Pull request not found');
    return row;
  }

  private toEntry(doc: PrContextDoc, changed: ReadonlyMap<string, string>): PrContextEntry {
    return {
      path: doc.path,
      kind: doc.kind,
      origin: originFor(doc.path, changed),
      status: doc.status,
      tokens: doc.tokens,
      read_at_sha: doc.sha || null,
      warnings: doc.warnings,
    };
  }

  async get(workspaceId: string, prId: string): Promise<PrContextResponse> {
    const { pr, repo } = await this.require(workspaceId, prId);
    const clonePath = await usableClonePath(repo.clonePath);
    const changedFiles = await this.repo.changedFiles(pr.id);
    const changed = changedStatusMap(changedFiles);
    const changedPaths = changedFiles.filter((f) => f.status !== 'removed').map((f) => f.path);

    const scan = clonePath ? await scanContextFiles(clonePath, this.rules) : { files: [], total: 0 };
    const attachable = buildAttachableList(
      scan.files.map((f) => f.path),
      changedFiles,
      this.rules,
    );

    const resolved = await resolvePrContext({
      git: this.container.git,
      tokenizer: this.container.tokenizer,
      repo: { owner: repo.owner, name: repo.name },
      clonePath,
      pr: { number: pr.number, headSha: pr.headSha, contextPaths: pr.contextPaths },
    });

    const suggestions = computeSuggestions({
      attachable,
      attached: pr.contextPaths,
      changedPaths,
      title: pr.title,
      body: pr.body,
      branch: pr.branch,
    });

    return {
      entries: resolved.entries.map((d) => this.toEntry(d, changed)),
      suggestions,
      attachable,
      budget: { used: resolved.tokensSent, limit: PR_CONTEXT_TOKEN_BUDGET },
      fingerprint: resolved.fingerprint,
      cloned: clonePath !== null,
      map_reduce: await this.repo.hasEnabledMapReduceAgent(workspaceId),
    };
  }

  /** Replace the ordered attached list (UI-1, EC-23) and return the fresh view. */
  async save(workspaceId: string, prId: string, paths: readonly string[]): Promise<PrContextResponse> {
    await this.require(workspaceId, prId);
    const unique = dedupePaths(paths);
    if (unique.length > MAX_PR_CONTEXT_PATHS) {
      throw new ValidationError(`At most ${MAX_PR_CONTEXT_PATHS} documents can be attached`);
    }
    for (const p of unique) {
      const check = validatePrContextPath(p, this.rules);
      if (!check.ok) throw new ValidationError(check.reason);
    }
    await this.repo.setContextPaths(workspaceId, prId, unique);
    return this.get(workspaceId, prId);
  }

  /**
   * AC-42: head SHA when the path is attached or among the changed files,
   * otherwise the default-branch clone (SPEC-04 rules).
   */
  async preview(workspaceId: string, prId: string, path: string): Promise<PrContextPreview> {
    // EC-22: the workspace/PR lookup (404) comes before path validation (422).
    const { pr, repo } = await this.require(workspaceId, prId);
    const check = validatePrContextPath(path, this.rules);
    if (!check.ok) throw new ValidationError(check.reason);
    const clonePath = await usableClonePath(repo.clonePath);
    const changed = changedStatusMap(await this.repo.changedFiles(pr.id));
    const kind = kindForPath(path);
    const origin = originFor(path, changed);

    if (pr.contextPaths.includes(path) || origin !== 'default_branch') {
      const resolved = await resolvePrContext({
        git: this.container.git,
        tokenizer: this.container.tokenizer,
        repo: { owner: repo.owner, name: repo.name },
        clonePath,
        pr: { number: pr.number, headSha: pr.headSha, contextPaths: [path] },
        budget: NO_BUDGET,
      });
      const doc = resolved.entries[0]!;
      const attached = doc.status === 'attached';
      return {
        path,
        kind,
        origin,
        status: attached ? 'attached' : doc.status === 'too_large' ? 'too_large' : doc.status === 'missing' ? 'missing' : 'unreadable',
        text: attached ? doc.text : null,
        tokens: doc.tokens,
        read_at_sha: doc.sha || null,
        read_from: 'head',
      };
    }

    if (!clonePath) {
      return { path, kind, origin, status: 'unreadable', text: null, tokens: 0, read_at_sha: null, read_from: 'default_branch' };
    }
    const read = await readContextFile(clonePath, path, PR_CONTEXT_MAX_FILE_BYTES);
    const sha = await this.container.git.currentHead({ owner: repo.owner, name: repo.name }).catch(() => null);
    if (read.status !== 'ok') {
      const status =
        read.status === 'missing' ? 'missing' : read.status === 'too_large' ? 'too_large' : 'unreadable';
      return { path, kind, origin, status, text: null, tokens: 0, read_at_sha: sha, read_from: 'default_branch' };
    }
    return {
      path,
      kind,
      origin,
      status: 'attached',
      text: read.text,
      tokens: wrappedTokenCount(this.container.tokenizer, path, read.text),
      read_at_sha: sha,
      read_from: 'default_branch',
    };
  }
}
