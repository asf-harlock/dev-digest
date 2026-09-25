import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import type { DevDigestApi } from '../api-client.js';
import type { McpConfig } from '../config.js';
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

async function connect(config: McpConfig): Promise<{ client: Client; server: McpServer }> {
  const api = {} as DevDigestApi;
  const server = buildMcpServer({ api, config });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe('get_blast_radius (stub)', () => {
  it('is absent from tools/list when DEVDIGEST_MCP_ENABLE_BLAST_RADIUS is off', async () => {
    const { client, server } = await connect(fakeConfig({ enableBlastRadius: false }));
    try {
      const { tools } = await client.listTools();
      expect(tools.some((t) => t.name === 'get_blast_radius')).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('is listed and always returns isError:true not_implemented when the flag is on', async () => {
    const { client, server } = await connect(fakeConfig({ enableBlastRadius: true }));
    try {
      const { tools } = await client.listTools();
      const tool = tools.find((t) => t.name === 'get_blast_radius');
      expect(tool).toBeDefined();

      const result = await client.callTool({
        name: 'get_blast_radius',
        arguments: { repo: 'acme/payments-api', pr: 482 },
      });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: 'text',
          text: 'not_implemented: get_blast_radius is not implemented yet (L04 homework), do not retry.',
        },
      ]);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
