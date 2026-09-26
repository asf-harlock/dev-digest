import type { Agent } from '@devdigest/shared';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import type { DevDigestApi } from '../api-client.js';
import type { McpConfig } from '../config.js';
import { apiUnavailable, McpToolError } from '../errors.js';
import { buildMcpServer } from '../server.js';

function fakeConfig(overrides: Partial<McpConfig> = {}): McpConfig {
  return {
    apiUrl: 'http://localhost:3001',
    runTimeoutMs: 55_000,
    pollIntervalMs: 2_000,
    enableBlastRadius: false,
    ...overrides,
  };
}

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

async function connect(api: DevDigestApi): Promise<{ server: McpServer; client: Client }> {
  const server = buildMcpServer({ api, config: fakeConfig() });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { server, client };
}

const fullAgent: Agent = {
  id: 'agent-1',
  name: 'Security Reviewer',
  description: 'Flags security issues in a diff.',
  provider: 'anthropic',
  model: 'claude-opus-4',
  system_prompt: 'SECRET SYSTEM PROMPT — never leak this to a client',
  output_schema: { type: 'object', properties: {} },
  enabled: true,
  version: 3,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
};

describe('list_agents', () => {
  it('returns the trimmed agent shape, never leaking system_prompt or output_schema', async () => {
    const { client, server } = await connect(fakeApi({ listAgents: async () => [fullAgent] }));
    try {
      const result = await client.callTool({ name: 'list_agents', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({
        agents: [
          {
            id: 'agent-1',
            name: 'Security Reviewer',
            description: 'Flags security issues in a diff.',
            provider: 'anthropic',
            model: 'claude-opus-4',
            enabled: true,
            strategy: 'single-pass',
            ci_fail_on: 'critical',
          },
        ],
      });

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('system_prompt');
      expect(serialized).not.toContain('SECRET SYSTEM PROMPT');
      expect(serialized).not.toContain('output_schema');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns an empty list when there are no agents', async () => {
    const { client, server } = await connect(fakeApi());
    try {
      const result = await client.callTool({ name: 'list_agents', arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ agents: [] });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('surfaces api_unavailable as an isError result, not a thrown exception', async () => {
    const { client, server } = await connect(
      fakeApi({
        listAgents: async () => {
          throw apiUnavailable('http://localhost:3001');
        },
      }),
    );
    try {
      const result = await client.callTool({ name: 'list_agents', arguments: {} });
      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]?.text).toBe(
        'api_unavailable: DevDigest API is unreachable at http://localhost:3001. Run ./scripts/dev.sh, then retry.',
      );
    } finally {
      await client.close();
      await server.close();
    }
  });
});
