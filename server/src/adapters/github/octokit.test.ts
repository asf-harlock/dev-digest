import { describe, it, expect, afterEach } from 'vitest';
import { OctokitGitHubClient } from './octokit.js';

/**
 * SPEC-07 AC-2: GitHub's per-file status is mapped onto `pr_files.status`
 * (added | modified | removed | renamed) so the Context tab can badge "added in
 * this PR" / "modified in this PR". The outside world (Octokit) is faked.
 */
function clientWithFiles(statuses: (string | undefined)[]): OctokitGitHubClient {
  const client = new OctokitGitHubClient('token');
  const pr = {
    number: 7,
    title: 't',
    user: { login: 'u' },
    head: { ref: 'feat', sha: 'a'.repeat(40) },
    base: { ref: 'main' },
    additions: 1,
    deletions: 0,
    changed_files: statuses.length,
    state: 'open',
    merged_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    body: '',
  };
  (client as unknown as { octokit: unknown }).octokit = {
    rest: {
      pulls: {
        get: async () => ({ data: pr }),
        listFiles: async () => ({
          data: statuses.map((status, i) => ({
            filename: `specs/f${i}.md`,
            status,
            additions: 1,
            deletions: 0,
            patch: '@@',
          })),
        }),
        listCommits: async () => ({ data: [] }),
      },
    },
  };
  return client;
}

describe('getPullRequest file status mapping (AC-2)', () => {
  it('AC-2: added, removed and renamed pass through', async () => {
    const detail = await clientWithFiles(['added', 'removed', 'renamed']).getPullRequest(
      { owner: 'o', name: 'r' },
      7,
    );
    expect(detail.files.map((f) => f.status)).toEqual(['added', 'removed', 'renamed']);
  });

  it('AC-2: modified, copied, changed, unchanged and unknown values all read as modified', async () => {
    const detail = await clientWithFiles(['modified', 'copied', 'changed', 'unchanged', 'weird', undefined]).getPullRequest(
      { owner: 'o', name: 'r' },
      7,
    );
    expect(detail.files.map((f) => f.status)).toEqual(Array(6).fill('modified'));
  });
});

// ---------------------------------------------------------------------------
// SPEC-12: Actions + Git Data calls behind the GitHub port. Octokit is faked.
// ---------------------------------------------------------------------------

const REPO = { owner: 'o', name: 'r' };

function clientWith(octokit: unknown): OctokitGitHubClient {
  const client = new OctokitGitHubClient('secret-token');
  // The CI methods use the fail-fast client, everything else the default one.
  (client as unknown as { octokit: unknown }).octokit = octokit;
  (client as unknown as { ciOctokit: unknown }).ciOctokit = octokit;
  return client;
}

function httpError(status: number, headers: Record<string, string> = {}): Error {
  return Object.assign(new Error('upstream says secret-token is bad'), {
    status,
    response: { status, headers },
  });
}

function gitFake(opts: { newTreeSha: string; branchExists: boolean; baseTreeSha?: string }) {
  const calls: string[] = [];
  const git = {
    getRef: async ({ ref }: { ref: string }) => {
      calls.push(`getRef:${ref}`);
      if (ref === 'heads/devdigest/ci' && !opts.branchExists) throw httpError(404);
      return { data: { object: { sha: ref === 'heads/devdigest/ci' ? 'parent' : 'base' } } };
    },
    getCommit: async ({ commit_sha }: { commit_sha: string }) => ({
      data: { tree: { sha: commit_sha === 'base' ? (opts.baseTreeSha ?? 'tree-old') : 'tree-old' } },
    }),
    createTree: async () => ({ data: { sha: opts.newTreeSha } }),
    createCommit: async () => {
      calls.push('createCommit');
      return { data: { sha: 'commit-new' } };
    },
    updateRef: async () => {
      calls.push('updateRef');
    },
    createRef: async () => {
      calls.push('createRef');
    },
  };
  return { calls, octokit: { rest: { git } } };
}

const PAYLOAD = {
  branch: 'devdigest/ci',
  base: 'main',
  message: 'm',
  files: [{ path: 'a.txt', contents: 'a' }],
};

describe('commitFiles (EC-10)', () => {
  it('EC-10: an identical tree makes no commit and reports changed=false', async () => {
    const f = gitFake({ newTreeSha: 'tree-old', branchExists: false });
    const res = await clientWith(f.octokit).commitFiles(REPO, PAYLOAD);
    expect(res).toEqual({ branch: 'devdigest/ci', changed: false });
    expect(f.calls).not.toContain('createCommit');
    expect(f.calls).not.toContain('createRef');
  });

  it('EC-9: an identical tree on a branch that still differs from the base makes no commit but reports changed=true', async () => {
    const f = gitFake({ newTreeSha: 'tree-old', branchExists: true, baseTreeSha: 'tree-base' });
    const res = await clientWith(f.octokit).commitFiles(REPO, PAYLOAD);
    expect(res).toEqual({ branch: 'devdigest/ci', changed: true });
    expect(f.calls).not.toContain('createCommit');
    expect(f.calls).not.toContain('updateRef');
  });

  it('EC-10: an identical tree on a branch equal to the base reports changed=false', async () => {
    const f = gitFake({ newTreeSha: 'tree-old', branchExists: true, baseTreeSha: 'tree-old' });
    const res = await clientWith(f.octokit).commitFiles(REPO, PAYLOAD);
    expect(res).toEqual({ branch: 'devdigest/ci', changed: false });
    expect(f.calls).not.toContain('createCommit');
  });

  it('a new tree on a missing branch creates the commit and the branch', async () => {
    const f = gitFake({ newTreeSha: 'tree-new', branchExists: false });
    const res = await clientWith(f.octokit).commitFiles(REPO, PAYLOAD);
    expect(res).toEqual({ branch: 'devdigest/ci', changed: true });
    expect(f.calls).toContain('createCommit');
    expect(f.calls).toContain('createRef');
  });

  it('a new tree on an existing branch fast-forwards it', async () => {
    const f = gitFake({ newTreeSha: 'tree-new', branchExists: true });
    const res = await clientWith(f.octokit).commitFiles(REPO, PAYLOAD);
    expect(res.changed).toBe(true);
    expect(f.calls).toContain('updateRef');
  });

  it('EC-2: a 403 on the commit becomes github_permission without the upstream text', async () => {
    const octokit = {
      rest: {
        git: {
          getRef: async () => {
            throw httpError(403);
          },
        },
      },
    };
    const err = await clientWith(octokit)
      .commitFiles(REPO, PAYLOAD)
      .catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: 'github_permission',
      details: { operation: 'commit_files', status: 403 },
    });
    expect((err as Error).message).not.toContain('secret-token');
    expect((err as Error).message.length).toBeLessThanOrEqual(200);
  });
});

describe('listWorkflowRuns / listRunArtifacts', () => {
  it('passes the workflow, event and page size and maps the run fields', async () => {
    let seen: Record<string, unknown> = {};
    const octokit = {
      rest: {
        actions: {
          listWorkflowRuns: async (p: Record<string, unknown>) => {
            seen = p;
            return {
              data: {
                workflow_runs: [
                  {
                    id: 9,
                    run_attempt: 2,
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc',
                    event: 'pull_request',
                    path: '.github/workflows/devdigest-review.yml',
                    head_repository: { full_name: 'o/r' },
                    html_url: 'https://github.com/o/r/actions/runs/9',
                    created_at: 'c',
                    run_started_at: null,
                    updated_at: 'u',
                    pull_requests: [{ number: 5 }],
                  },
                ],
              },
            };
          },
        },
      },
    };
    const runs = await clientWith(octokit).listWorkflowRuns(REPO, {
      workflowPath: '.github/workflows/devdigest-review.yml',
      event: 'pull_request',
      perPage: 30,
    });
    expect(seen).toMatchObject({
      workflow_id: '.github/workflows/devdigest-review.yml',
      event: 'pull_request',
      per_page: 30,
    });
    expect(runs).toEqual([
      {
        id: 9,
        run_attempt: 2,
        status: 'completed',
        conclusion: 'success',
        head_sha: 'abc',
        event: 'pull_request',
        path: '.github/workflows/devdigest-review.yml',
        head_repository_full_name: 'o/r',
        html_url: 'https://github.com/o/r/actions/runs/9',
        created_at: 'c',
        run_started_at: null,
        updated_at: 'u',
        pull_requests: [5],
      },
    ]);
  });

  it('EC-26: a rate limit is raised at once as rate_limited with the reset time', async () => {
    let attempts = 0;
    const octokit = {
      rest: {
        actions: {
          listWorkflowRuns: async () => {
            attempts++;
            throw httpError(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1800000000' });
          },
        },
      },
    };
    const err = await clientWith(octokit)
      .listWorkflowRuns(REPO, { workflowPath: 'w', event: 'pull_request', perPage: 30 })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({
      code: 'rate_limited',
      details: { reset_at: new Date(1800000000 * 1000).toISOString() },
    });
    expect(attempts).toBe(1);
  });

  it('EC-25: a 403 without rate-limit headers is github_permission', async () => {
    const octokit = {
      rest: {
        actions: {
          listWorkflowRunArtifacts: async () => {
            throw httpError(403);
          },
        },
      },
    };
    await expect(clientWith(octokit).listRunArtifacts(REPO, 1)).rejects.toMatchObject({
      code: 'github_permission',
      details: { operation: 'list_run_artifacts' },
    });
  });
});

describe('downloadArtifact (EC-23, NFR-9)', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function redirecting(location: string | null, status = 302) {
    const requests: unknown[] = [];
    return {
      requests,
      octokit: {
        request: async (route: string, params: unknown) => {
          requests.push({ route, params });
          return { status, headers: location ? { location } : {} };
        },
      },
    };
  }

  it('follows the 302 by hand and sends NO Authorization header to the storage host', async () => {
    const r = redirecting('https://storage.example.com/signed?sig=1');
    let init: RequestInit | undefined;
    let target = '';
    globalThis.fetch = (async (url: URL, i?: RequestInit) => {
      target = String(url);
      init = i;
      return new Response(new Uint8Array([1, 2, 3]));
    }) as typeof fetch;
    const bytes = await clientWith(r.octokit).downloadArtifact(REPO, 77);
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(target).toBe('https://storage.example.com/signed?sig=1');
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    expect(r.requests[0]).toMatchObject({
      params: { artifact_id: 77, archive_format: 'zip', request: { redirect: 'manual' } },
    });
  });

  it('EC-23: 410 from the API is artifact_expired', async () => {
    const octokit = {
      request: async () => {
        throw httpError(410);
      },
    };
    await expect(clientWith(octokit).downloadArtifact(REPO, 1)).rejects.toMatchObject({
      code: 'artifact_expired',
    });
  });

  it('EC-23: 410 from the storage host is artifact_expired', async () => {
    const r = redirecting('https://storage.example.com/x');
    globalThis.fetch = (async () => new Response('gone', { status: 410 })) as typeof fetch;
    await expect(clientWith(r.octokit).downloadArtifact(REPO, 1)).rejects.toMatchObject({
      code: 'artifact_expired',
    });
  });

  it('NFR-9: a declared size over 16 MiB is refused before the body is read', async () => {
    const r = redirecting('https://storage.example.com/x');
    globalThis.fetch = (async () =>
      new Response(new Uint8Array(4), {
        headers: { 'content-length': String(16 * 1024 * 1024 + 1) },
      })) as typeof fetch;
    await expect(clientWith(r.octokit).downloadArtifact(REPO, 1)).rejects.toMatchObject({
      code: 'artifact_rejected',
    });
  });

  it('NFR-9: a body that outgrows 16 MiB while streaming is refused', async () => {
    const r = redirecting('https://storage.example.com/x');
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 20) controller.enqueue(chunk);
        else controller.close();
      },
    });
    globalThis.fetch = (async () => new Response(body)) as typeof fetch;
    await expect(clientWith(r.octokit).downloadArtifact(REPO, 1)).rejects.toMatchObject({
      code: 'artifact_rejected',
    });
  });

  it('refuses a non-https redirect target', async () => {
    const r = redirecting('http://storage.example.com/x');
    await expect(clientWith(r.octokit).downloadArtifact(REPO, 1)).rejects.toMatchObject({
      code: 'artifact_rejected',
    });
  });

  it('refuses a response that is not a redirect', async () => {
    const r = redirecting(null, 200);
    await expect(clientWith(r.octokit).downloadArtifact(REPO, 1)).rejects.toMatchObject({
      code: 'artifact_rejected',
    });
  });
});
