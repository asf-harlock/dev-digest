import { Octokit } from 'octokit';
import type {
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  PrStatus,
  PrFileStatus,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  CommitFilesResult,
  IssueMeta,
  WorkflowRun,
  RunArtifact,
  ListWorkflowRunsOptions,
} from '@devdigest/shared';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { AppError } from '../../platform/errors.js';

const TIMEOUT = 30_000;
/** One commit = several sequential Git Data calls (SPEC-12 Q-6). */
const COMMIT_TIMEOUT = 120_000;
/** Compressed artifact cap — checked before the body is buffered (SPEC-12 NFR-9). */
const MAX_ARTIFACT_COMPRESSED_BYTES = 16 * 1024 * 1024;
/** Longest message text this adapter puts into a classified error (SPEC-12 NFR-12). */
const MAX_ERROR_TEXT = 200;

/**
 * GitHub file status -> pr_files.status (added | modified | removed | renamed).
 * `copied`, `changed` and `unchanged` (and anything unknown) map to `modified`.
 */
function mapFileStatus(status: string | undefined): PrFileStatus {
  if (status === 'added' || status === 'removed' || status === 'renamed') return status;
  return 'modified';
}

function mapStatus(state: string, merged: boolean | undefined): PrStatus {
  if (merged) return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

function httpStatus(err: unknown): number | undefined {
  const e = err as { status?: unknown; response?: { status?: unknown } } | null;
  const status = e?.status ?? e?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

function responseHeader(err: unknown, name: string): string | undefined {
  const headers = (err as { response?: { headers?: Record<string, unknown> } } | null)?.response
    ?.headers;
  const v = headers?.[name];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;
}

/** Primary (403 + remaining=0) or secondary (429) rate limit. */
function isRateLimited(err: unknown): boolean {
  const status = httpStatus(err);
  if (status === 429) return true;
  return status === 403 && responseHeader(err, 'x-ratelimit-remaining') === '0';
}

/** Retry only transient failures; rate limits are surfaced at once (EC-26). */
function isTransient(err: unknown): boolean {
  if (isRateLimited(err)) return false;
  const status = httpStatus(err);
  if (status !== undefined) return status >= 500;
  const code = (err as { code?: string } | null)?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND';
}

function boundedText(text: string): string {
  return text.length > MAX_ERROR_TEXT ? `${text.slice(0, MAX_ERROR_TEXT - 1)}…` : text;
}

/**
 * Map a failed Actions/Git call to a classified `AppError`. The text is fixed
 * (never the upstream message), so no token or URL can leak (NFR-12).
 *  - 403/404 -> `github_permission` with `details.operation` (EC-2, EC-25)
 *  - rate limit -> `rate_limited` with `details.reset_at` when known (EC-26)
 *  - anything else passes through untouched.
 */
function classifyGitHubError(err: unknown, operation: string): unknown {
  if (err instanceof AppError) return err;
  if (isRateLimited(err)) {
    const reset = Number(responseHeader(err, 'x-ratelimit-reset'));
    const details =
      Number.isFinite(reset) && reset > 0 ? { reset_at: new Date(reset * 1000).toISOString() } : {};
    return new AppError('rate_limited', boundedText('GitHub rate limit reached'), 429, details);
  }
  const status = httpStatus(err);
  if (status === 403 || status === 404) {
    return new AppError(
      'github_permission',
      boundedText('GitHub denied access: the token lacks the required repository permission'),
      403,
      { operation, status },
    );
  }
  return err;
}

/** Read a response body, refusing it once it exceeds `max` bytes (declared or actual). */
async function readCapped(res: Response, max: number): Promise<Uint8Array> {
  const tooLarge = () =>
    new AppError('artifact_rejected', `The artifact exceeds the ${max}-byte limit`, 422);
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    await res.body?.cancel();
    throw tooLarge();
  }
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** `withRetry(withTimeout(fn))` for the CI calls, with errors classified. */
async function guarded<T>(
  operation: string,
  fn: () => Promise<T>,
  timeoutMs = TIMEOUT,
): Promise<T> {
  try {
    return await withRetry(() => withTimeout(fn(), timeoutMs), { isRetryable: isTransient });
  } catch (err) {
    throw classifyGitHubError(err, operation);
  }
}

/**
 * GitHubClient over Octokit REST — thin. PAT auth (fine-grained).
 * Reads PR list/detail/files/commits/issue; posts reviews; opens PRs.
 */
export class OctokitGitHubClient implements GitHubClient {
  /** Default client (library throttling) for reviews, polling, issues, login. */
  private octokit: Octokit;
  /**
   * Export-to-CI client: fails fast on a rate limit (the default handlers sleep until
   * the reset and retry once) so `rate_limited` reaches the caller with its reset time (EC-26).
   */
  private ciOctokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
    this.ciOctokit = new Octokit({
      auth: token,
      throttle: { onRateLimit: () => false, onSecondaryRateLimit: () => false },
    });
  }

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          // Fetch open + recently merged/closed (most-recently-updated first) so
          // the list shows which PRs are merged vs still open — not just open.
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 50,
          });
          return res.data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: 0,
            deletions: 0,
            files_count: 0, // not present on the list payload; populated by getPullRequest
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
          }));
        })(),
        TIMEOUT,
      ),
    );
  }

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const { data: pr } = await this.octokit.rest.pulls.get({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
          });
          const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const { data: commits } = await this.octokit.rest.pulls.listCommits({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const linkedIssue = await this.resolveLinkedIssue(repo, pr.body ?? '');
          return {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: pr.additions,
            deletions: pr.deletions,
            files_count: pr.changed_files,
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
            body: pr.body,
            files: files.map((f) => ({
              path: f.filename,
              status: mapFileStatus(f.status),
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
            })),
            commits: commits.map((c) => ({
              sha: c.sha,
              message: c.commit.message,
              author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
              committed_at: c.commit.author?.date,
            })),
            linked_issue: linkedIssue,
          };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** linked issue via regex on PR body (#123 / closes #123). */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return undefined;
    try {
      return await this.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.createReview({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            body: review.body,
            event: review.event,
            comments: review.comments?.map((c) => ({
              path: c.path,
              line: c.line,
              body: c.body,
            })),
          });
          return { id: String(res.data.id) };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** Shape an Octokit review-comment payload into our DTO. */
  private mapReviewComment(c: {
    id: number;
    path: string;
    line?: number | null;
    original_line?: number | null;
    side?: string | null;
    body: string;
    user: { login: string } | null;
    created_at: string;
    html_url: string;
    in_reply_to_id?: number;
  }): PrReviewComment {
    return {
      id: c.id,
      path: c.path,
      line: c.line ?? null,
      original_line: c.original_line ?? null,
      side: c.side === 'LEFT' ? 'LEFT' : 'RIGHT',
      body: c.body,
      user: c.user?.login ?? 'unknown',
      created_at: c.created_at,
      html_url: c.html_url,
      in_reply_to_id: c.in_reply_to_id ?? null,
      // GitHub drops `line` when the comment can no longer be placed on the diff.
      is_outdated: c.line == null,
    };
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.listReviewComments({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          return res.data.map((c) => this.mapReviewComment(c));
        })(),
        TIMEOUT,
      ),
    );
  }

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          if (input.inReplyTo != null) {
            const res = await this.octokit.rest.pulls.createReplyForReviewComment({
              owner: repo.owner,
              repo: repo.name,
              pull_number: n,
              comment_id: input.inReplyTo,
              body: input.body,
            });
            return this.mapReviewComment(res.data);
          }
          const res = await this.octokit.rest.pulls.createReviewComment({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            commit_id: input.commitId,
            path: input.path,
            line: input.line,
            side: input.side ?? 'RIGHT',
            body: input.body,
          });
          return this.mapReviewComment(res.data);
        })(),
        TIMEOUT,
      ),
    );
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.ciOctokit.rest.pulls.create({
            owner: repo.owner,
            repo: repo.name,
            title: payload.title,
            head: payload.head,
            base: payload.base,
            body: payload.body,
          });
          return { url: res.data.html_url };
        })(),
        TIMEOUT,
      ),
    );
  }

  async commitFiles(repo: RepoRef, payload: CommitFilesPayload): Promise<CommitFilesResult> {
    return guarded('commit_files', async () => {
      const owner = repo.owner;
      const name = repo.name;
      const g = this.ciOctokit.rest.git;

      // Parent commit: the target branch if it already exists, else the base.
      let parentSha: string;
      let branchExists = false;
      try {
        const ref = await g.getRef({ owner, repo: name, ref: `heads/${payload.branch}` });
        parentSha = ref.data.object.sha;
        branchExists = true;
      } catch (err) {
        if (httpStatus(err) !== 404) throw err;
        const baseRef = await g.getRef({ owner, repo: name, ref: `heads/${payload.base}` });
        parentSha = baseRef.data.object.sha;
      }

      // New tree layered on the parent's tree (so unrelated files are kept).
      const parentCommit = await g.getCommit({ owner, repo: name, commit_sha: parentSha });
      const tree = await g.createTree({
        owner,
        repo: name,
        base_tree: parentCommit.data.tree.sha,
        tree: payload.files.map((f) => ({
          path: f.path,
          mode: '100644',
          type: 'blob',
          content: f.contents,
        })),
      });

      // Identical tree: nothing to commit, so no empty commit (EC-10).
      if (tree.data.sha === parentCommit.data.tree.sha) {
        // The parent is the base itself: the base already holds these files.
        if (!branchExists) return { branch: payload.branch, changed: false };
        // The branch already carries the files (a retry after a failed PR open, EC-9).
        // `changed` then says whether it still differs from the base, i.e. whether
        // there is something to propose; no commit is made either way.
        const baseRef = await g.getRef({ owner, repo: name, ref: `heads/${payload.base}` });
        const baseCommit = await g.getCommit({
          owner,
          repo: name,
          commit_sha: baseRef.data.object.sha,
        });
        return {
          branch: payload.branch,
          changed: baseCommit.data.tree.sha !== parentCommit.data.tree.sha,
        };
      }

      const commit = await g.createCommit({
        owner,
        repo: name,
        message: payload.message,
        tree: tree.data.sha,
        parents: [parentSha],
      });

      if (branchExists) {
        await g.updateRef({
          owner,
          repo: name,
          ref: `heads/${payload.branch}`,
          sha: commit.data.sha,
          force: true,
        });
      } else {
        await g.createRef({
          owner,
          repo: name,
          ref: `refs/heads/${payload.branch}`,
          sha: commit.data.sha,
        });
      }
      return { branch: payload.branch, changed: true };
    }, COMMIT_TIMEOUT);
  }

  async findOpenPr(repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.ciOctokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'open',
            head: `${repo.owner}:${branch}`,
            per_page: 1,
          });
          const pr = res.data[0];
          return pr ? { url: pr.html_url } : null;
        })(),
        TIMEOUT,
      ),
    );
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.issues.get({ owner: repo.owner, repo: repo.name, issue_number: n }),
        TIMEOUT,
      ),
    );
    return {
      number: res.data.number,
      title: res.data.title,
      body: res.data.body,
      state: res.data.state,
    };
  }

  async currentLogin(): Promise<string> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.users.getAuthenticated(), TIMEOUT),
    );
    return res.data.login;
  }

  async listWorkflowRuns(repo: RepoRef, opts: ListWorkflowRunsOptions): Promise<WorkflowRun[]> {
    return guarded('list_workflow_runs', async () => {
      const res = await this.ciOctokit.rest.actions.listWorkflowRuns({
        owner: repo.owner,
        repo: repo.name,
        workflow_id: opts.workflowPath,
        event: opts.event,
        per_page: opts.perPage,
      });
      return res.data.workflow_runs.map((r) => ({
        id: r.id,
        run_attempt: r.run_attempt ?? 1,
        status: r.status ?? 'unknown',
        conclusion: r.conclusion ?? null,
        head_sha: r.head_sha,
        event: r.event,
        path: r.path,
        head_repository_full_name: r.head_repository?.full_name ?? null,
        html_url: r.html_url,
        created_at: r.created_at,
        run_started_at: r.run_started_at ?? null,
        updated_at: r.updated_at,
        pull_requests: (r.pull_requests ?? []).map((pr) => pr.number),
      }));
    });
  }

  async listRunArtifacts(repo: RepoRef, runId: number): Promise<RunArtifact[]> {
    return guarded('list_run_artifacts', async () => {
      const res = await this.ciOctokit.rest.actions.listWorkflowRunArtifacts({
        owner: repo.owner,
        repo: repo.name,
        run_id: runId,
        per_page: 100,
      });
      return res.data.artifacts.map((a) => ({
        id: a.id,
        name: a.name,
        size_in_bytes: a.size_in_bytes,
        expired: a.expired,
      }));
    });
  }

  /**
   * GitHub answers the zip request with a 302 to a short-lived signed URL. The
   * redirect is followed here by hand so the Authorization header (the user's
   * token) is never sent to the storage host. 410/404 -> `artifact_expired`.
   */
  async downloadArtifact(repo: RepoRef, artifactId: number): Promise<Uint8Array> {
    return guarded('download_artifact', async () => {
      let res;
      try {
        res = await this.ciOctokit.request(
          'GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/{archive_format}',
          {
            owner: repo.owner,
            repo: repo.name,
            artifact_id: artifactId,
            archive_format: 'zip',
            request: { redirect: 'manual' },
          },
        );
      } catch (err) {
        // 410 = expired; 404 = deleted. Either way the artifact is gone.
        if (httpStatus(err) === 410 || httpStatus(err) === 404) {
          throw new AppError('artifact_expired', 'The artifact has expired', 410);
        }
        throw err;
      }

      const location = res.headers.location;
      if (res.status !== 302 || typeof location !== 'string') {
        throw new AppError('artifact_rejected', 'GitHub returned no artifact download URL', 502);
      }
      let url: URL;
      try {
        url = new URL(location);
      } catch {
        throw new AppError('artifact_rejected', 'GitHub returned an invalid download URL', 502);
      }
      if (url.protocol !== 'https:') {
        throw new AppError('artifact_rejected', 'GitHub returned a non-HTTPS download URL', 502);
      }

      // No Authorization header: the signed URL carries its own credentials.
      const file = await fetch(url, { redirect: 'error' });
      if (file.status === 410 || file.status === 404) {
        throw new AppError('artifact_expired', 'The artifact has expired', 410);
      }
      if (!file.ok || !file.body) {
        throw new AppError('artifact_rejected', 'The artifact could not be downloaded', 502);
      }
      return readCapped(file, MAX_ARTIFACT_COMPRESSED_BYTES);
    });
  }
}
