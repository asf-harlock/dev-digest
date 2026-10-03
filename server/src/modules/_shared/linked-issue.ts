import type { RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';

/**
 * `#123` / `closes #123` / `fixes #123` / `resolves #123` — the SAME regex
 * `OctokitGitHubClient`'s (private) `resolveLinkedIssue` uses
 * (`adapters/github/octokit.ts`). Kept here rather than imported: a module may
 * not import a concrete adapter class (`no-concrete-adapter-in-modules`).
 * `container.github().getIssue(...)` (the port method) does the fetching.
 */
export const LINKED_ISSUE_RE = /(?:closes|fixes|resolves)?\s*#(\d+)/i;

export interface LinkedIssueResult {
  status: 'none' | 'used' | 'unreachable';
  /** `#N title\nbody` when `status` is `used`. */
  text?: string;
  /** Error message when `status` is `unreachable`. */
  note?: string;
}

/**
 * Resolve the issue a PR description links to, if any. Never throws: a lookup
 * failure is reported as `unreachable`.
 */
export async function resolveLinkedIssue(input: {
  container: Container;
  repoRef: RepoRef;
  body: string | null | undefined;
}): Promise<LinkedIssueResult> {
  const match = (input.body ?? '').match(LINKED_ISSUE_RE);
  if (!match?.[1]) return { status: 'none' };
  try {
    const gh = await input.container.github();
    const issue = await gh.getIssue(input.repoRef, Number(match[1]));
    return { status: 'used', text: `#${issue.number} ${issue.title}\n${issue.body ?? ''}` };
  } catch (err) {
    return {
      status: 'unreachable',
      note: err instanceof Error ? err.message : 'Linked issue could not be fetched',
    };
  }
}
