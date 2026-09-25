import type { Agent } from '@devdigest/shared';
import { describe, expect, it } from 'vitest';
import type { DevDigestApi } from './api-client.js';
import { McpToolError } from './errors.js';
import { resolveAgent, resolvePull, resolveRepo } from './resolvers.js';

function fakeApi(overrides: Partial<DevDigestApi> = {}): DevDigestApi {
  return {
    listAgents: async () => [],
    lookupRepo: async () => {
      throw new McpToolError('not_found', 'not found');
    },
    lookupPull: async () => {
      throw new McpToolError('not_found', 'not found');
    },
    startReview: async () => ({ run_id: 'run-1' }),
    getRun: async () => {
      throw new Error('unused in these tests');
    },
    getRunFindings: async () => {
      throw new Error('unused in these tests');
    },
    getConventions: async () => {
      throw new Error('unused in these tests');
    },
    ...overrides,
  };
}

describe('resolveRepo', () => {
  it('returns the repo on success', async () => {
    const repo = { id: 'r1', full_name: 'acme/payments-api', name: 'payments-api' };
    const api = fakeApi({ lookupRepo: async () => repo });
    await expect(resolveRepo(api, 'acme/payments-api')).resolves.toEqual(repo);
  });

  it('rewrites a not_found into the plan hint', async () => {
    const api = fakeApi();
    const err = await resolveRepo(api, 'acme/missing').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).message).toBe(
      "Repo 'acme/missing' not found. Add it in the web UI, then retry.",
    );
  });
});

describe('resolvePull', () => {
  it('returns the pull on success', async () => {
    const pull = { id: 'p1', repo_id: 'r1', number: 482, title: 'Add feature' };
    const api = fakeApi({ lookupPull: async () => pull });
    await expect(resolvePull(api, 'r1', 'acme/payments-api', 482)).resolves.toEqual(pull);
  });

  it('rewrites a not_found into the plan hint, naming the PR number and repo', async () => {
    const api = fakeApi();
    const err = await resolvePull(api, 'r1', 'acme/payments-api', 999).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).message).toBe(
      "PR #999 not found in acme/payments-api. Import PRs in the web UI, then retry.",
    );
  });
});

const agentA = { id: 'agent-a', name: 'Security Reviewer' } as unknown as Agent;
const agentB = { id: 'agent-b', name: 'Style Reviewer' } as unknown as Agent;
const agentDup1 = { id: 'agent-dup-1', name: 'Reviewer' } as unknown as Agent;
const agentDup2 = { id: 'agent-dup-2', name: 'Reviewer' } as unknown as Agent;

describe('resolveAgent', () => {
  it('matches by id exactly', async () => {
    const api = fakeApi({ listAgents: async () => [agentA, agentB] });
    await expect(resolveAgent(api, 'agent-b')).resolves.toEqual(agentB);
  });

  it('matches by name, case-insensitively', async () => {
    const api = fakeApi({ listAgents: async () => [agentA, agentB] });
    await expect(resolveAgent(api, 'security reviewer')).resolves.toEqual(agentA);
    await expect(resolveAgent(api, 'SECURITY REVIEWER')).resolves.toEqual(agentA);
  });

  it('throws not_found on zero matches', async () => {
    const api = fakeApi({ listAgents: async () => [agentA, agentB] });
    const err = await resolveAgent(api, 'nonexistent').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).code).toBe('not_found');
    expect((err as McpToolError).message).toBe(
      "Agent 'nonexistent' not found. Call list_agents to see valid ids/names.",
    );
  });

  it('throws not_found with an id hint on 2+ name matches', async () => {
    const api = fakeApi({ listAgents: async () => [agentDup1, agentDup2] });
    const err = await resolveAgent(api, 'reviewer').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).code).toBe('not_found');
    expect((err as McpToolError).message).toContain('several agents share this name, pass the id');
  });
});
