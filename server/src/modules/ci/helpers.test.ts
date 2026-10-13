import { describe, it, expect } from 'vitest';
import {
  deriveRunStatus,
  deriveVerdict,
  isExpectedWorkflowRun,
  isTrustedJobUrl,
  prUrl,
  runnerRepoPath,
  severityBlockers,
  slugify,
  stripWorkflowRef,
  truncateGithubError,
  uniqueSlugs,
} from './helpers.js';

describe('slugify', () => {
  it('keeps only [a-z0-9-] and never starts with a dot or separator', () => {
    expect(slugify('Security Reviewer')).toBe('security-reviewer');
    expect(slugify('../../etc/passwd')).toBe('etc-passwd');
    expect(slugify('.hidden')).toBe('hidden');
    expect(slugify('a/b\\c')).toBe('a-b-c');
  });
  it('caps at 64 characters without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(63)} b`);
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith('-')).toBe(false);
    expect(slugify('x'.repeat(200))).toHaveLength(64);
  });
  it('falls back when nothing survives', () => {
    expect(slugify('日本語')).toBe('agent');
    expect(slugify('!!!', 'skill')).toBe('skill');
    expect(slugify('')).toBe('agent');
  });
});

describe('uniqueSlugs (EC-15)', () => {
  it('suffixes later duplicates with -2, -3', () => {
    expect(uniqueSlugs(['Lint', 'lint', 'LINT'], 'skill')).toEqual(['lint', 'lint-2', 'lint-3']);
  });
  it('does not collide with a later natural slug', () => {
    expect(uniqueSlugs(['a', 'a', 'a-2'])).toEqual(['a', 'a-2', 'a-2-2']);
  });
  it('keeps the 64-char cap when suffixing', () => {
    const long = 'x'.repeat(80);
    const slugs = uniqueSlugs([long, long]);
    expect(slugs[1]!.length).toBeLessThanOrEqual(64);
    expect(new Set(slugs).size).toBe(2);
  });
});

describe('severityBlockers / deriveVerdict (AC-47)', () => {
  const counts = { critical: 1, warning: 2, suggestion: 3 };
  it('counts findings that meet the threshold', () => {
    expect(severityBlockers(counts, 'never')).toBe(0);
    expect(severityBlockers(counts, 'critical')).toBe(1);
    expect(severityBlockers(counts, 'warning')).toBe(3);
    expect(severityBlockers(counts, 'any')).toBe(6);
  });
  it('request_changes when a finding meets the threshold', () => {
    expect(deriveVerdict({ ...counts, findings_count: 6 }, 'critical')).toBe('request_changes');
  });
  it('never never requests changes', () => {
    expect(deriveVerdict({ ...counts, findings_count: 6 }, 'never')).toBe('comment');
  });
  it('approve with no findings, comment otherwise', () => {
    const none = { critical: 0, warning: 0, suggestion: 0, findings_count: 0 };
    expect(deriveVerdict(none, 'any')).toBe('approve');
    expect(deriveVerdict({ ...none, suggestion: 2, findings_count: 2 }, 'critical')).toBe('comment');
  });
});

describe('deriveRunStatus (AC-59)', () => {
  it('failed unless success with a verified artifact', () => {
    expect(deriveRunStatus({ conclusion: 'failure', artifactOk: true, findingsCount: 2 })).toBe('failed');
    expect(deriveRunStatus({ conclusion: 'cancelled', artifactOk: true, findingsCount: 0 })).toBe('failed');
    expect(deriveRunStatus({ conclusion: 'success', artifactOk: false, findingsCount: null })).toBe('failed');
  });
  it('no_findings / succeeded on success', () => {
    expect(deriveRunStatus({ conclusion: 'success', artifactOk: true, findingsCount: 0 })).toBe('no_findings');
    expect(deriveRunStatus({ conclusion: 'success', artifactOk: true, findingsCount: 3 })).toBe('succeeded');
  });
});

describe('isTrustedJobUrl (UI-11)', () => {
  const repo = 'acme/payments-api';
  it('accepts a github.com actions run URL of the repository', () => {
    expect(isTrustedJobUrl('https://github.com/acme/payments-api/actions/runs/123', repo)).toBe(true);
    expect(isTrustedJobUrl('https://github.com/Acme/Payments-API/actions/runs/1/job/2', repo)).toBe(true);
  });
  it.each([
    'http://github.com/acme/payments-api/actions/runs/1',
    'https://evil.com/acme/payments-api/actions/runs/1',
    'https://github.com.evil.com/acme/payments-api/actions/runs/1',
    'https://user:pw@github.com/acme/payments-api/actions/runs/1',
    'https://github.com/other/repo/actions/runs/1',
    'https://github.com/acme/payments-api/pull/1',
    'javascript:alert(1)',
    '',
  ])('rejects %s', (url) => {
    expect(isTrustedJobUrl(url, repo)).toBe(false);
  });
  it('rejects null and a malformed repo', () => {
    expect(isTrustedJobUrl(null, repo)).toBe(false);
    expect(isTrustedJobUrl('https://github.com/a/b/actions/runs/1', 'not a repo')).toBe(false);
  });
});

describe('prUrl (UI-12)', () => {
  it('builds the link from repo and integer', () => {
    expect(prUrl('acme/payments-api', 42)).toBe('https://github.com/acme/payments-api/pull/42');
  });
  it('returns null for a bad number or repo', () => {
    expect(prUrl('acme/payments-api', null)).toBeNull();
    expect(prUrl('acme/payments-api', 1.5)).toBeNull();
    expect(prUrl('acme/payments-api', 0)).toBeNull();
    expect(prUrl('acme/payments-api/../x', 1)).toBeNull();
  });
});

describe('truncateGithubError (UI-13, NFR-12)', () => {
  it('caps at 200 characters', () => {
    expect(truncateGithubError('x'.repeat(500))).toHaveLength(200);
  });
  it('removes known token shapes and explicit secrets', () => {
    const pat = `ghp_${'a'.repeat(36)}`;
    const out = truncateGithubError(`bad credentials ${pat} and github_pat_${'B'.repeat(40)} Bearer abcdefghijkl`, [
      'my-custom-token',
    ]);
    expect(out).not.toContain(pat);
    expect(out).not.toMatch(/github_pat_/);
    expect(out).not.toMatch(/Bearer abc/);
    expect(truncateGithubError('boom my-custom-token', ['my-custom-token'])).toBe('boom [redacted]');
  });
  it('scrubs before truncating so a token cut at the limit does not leak', () => {
    const out = truncateGithubError(`${'x'.repeat(190)} ghp_${'a'.repeat(36)}`);
    expect(out).not.toMatch(/ghp_/);
  });
  it('handles non-strings', () => {
    expect(truncateGithubError(undefined)).toBe('');
    expect(truncateGithubError(new Error('oops'))).toBe('Error: oops');
  });
});

describe('workflow run origin (UI-10)', () => {
  it('strips a @ref suffix', () => {
    expect(stripWorkflowRef('.github/workflows/devdigest-review.yml@refs/pull/1/merge')).toBe(
      '.github/workflows/devdigest-review.yml',
    );
    expect(stripWorkflowRef('.github/workflows/devdigest-review.yml')).toBe(
      '.github/workflows/devdigest-review.yml',
    );
  });
  const run = {
    event: 'pull_request',
    path: '.github/workflows/devdigest-review.yml@refs/heads/main',
    head_repository_full_name: 'Acme/Payments-API',
  };
  it('accepts our workflow on a same-repo pull_request', () => {
    expect(isExpectedWorkflowRun(run, 'acme/payments-api')).toBe(true);
  });
  it('rejects another event, path or head repository', () => {
    expect(isExpectedWorkflowRun({ ...run, event: 'push' }, 'acme/payments-api')).toBe(false);
    expect(isExpectedWorkflowRun({ ...run, path: '.github/workflows/other.yml' }, 'acme/payments-api')).toBe(false);
    expect(isExpectedWorkflowRun({ ...run, head_repository_full_name: 'fork/payments-api' }, 'acme/payments-api')).toBe(false);
    expect(isExpectedWorkflowRun({ ...run, head_repository_full_name: null }, 'acme/payments-api')).toBe(false);
  });
});

describe('runnerRepoPath', () => {
  it('prefixes the runner directory', () => {
    expect(runnerRepoPath('382.index.js')).toBe('.devdigest/runner/382.index.js');
  });
});
