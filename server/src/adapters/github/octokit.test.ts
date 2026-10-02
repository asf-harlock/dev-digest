import { describe, it, expect } from 'vitest';
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
