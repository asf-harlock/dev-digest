import { describe, expect, it, vi } from 'vitest';

const created: Array<Record<string, unknown>> = [];

vi.mock('octokit', () => ({
  Octokit: class {
    constructor(options: Record<string, unknown>) {
      created.push(options);
    }
  },
}));

const { OctokitGitHubClient } = await import('./octokit.js');

describe('throttle scope (EC-26)', () => {
  it('only the Export-to-CI client fails fast on a rate limit; the default client keeps the library throttle', () => {
    created.length = 0;
    const client = new OctokitGitHubClient('secret-token') as unknown as {
      octokit: unknown;
      ciOctokit: unknown;
    };

    expect(created).toHaveLength(2);
    const [defaults, ci] = created as [
      Record<string, unknown>,
      { throttle: { onRateLimit: () => boolean; onSecondaryRateLimit: () => boolean } },
    ];
    // No throttle option: reviews, polling, issues and login keep Octokit's defaults.
    expect(defaults).not.toHaveProperty('throttle');
    expect(ci.throttle.onRateLimit()).toBe(false);
    expect(ci.throttle.onSecondaryRateLimit()).toBe(false);
    expect(client.octokit).not.toBe(client.ciOctokit);
  });
});
