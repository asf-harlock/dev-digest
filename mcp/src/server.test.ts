import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevDigestApi } from './api-client.js';
import type { McpConfig } from './config.js';

// Referenced inside the vi.mock factories below — must go through
// vi.hoisted() or the factories would see them before initialization
// (vi.mock calls are hoisted above regular `const` declarations).
const mocks = vi.hoisted(() => ({
  registerListAgents: vi.fn(),
  registerRunAgentOnPr: vi.fn(),
  registerGetFindings: vi.fn(),
  registerGetConventions: vi.fn(),
  registerGetBlastRadius: vi.fn(),
}));

vi.mock('./tools/list-agents.js', () => ({ registerListAgents: mocks.registerListAgents }));
vi.mock('./tools/run-agent-on-pr.js', () => ({ registerRunAgentOnPr: mocks.registerRunAgentOnPr }));
vi.mock('./tools/get-findings.js', () => ({ registerGetFindings: mocks.registerGetFindings }));
vi.mock('./tools/get-conventions.js', () => ({ registerGetConventions: mocks.registerGetConventions }));
vi.mock('./tools/get-blast-radius.js', () => ({ registerGetBlastRadius: mocks.registerGetBlastRadius }));

const { buildMcpServer, INSTRUCTIONS } = await import('./server.js');

function fakeDeps(overrides: Partial<McpConfig> = {}) {
  const api = {} as DevDigestApi;
  const config: McpConfig = {
    apiUrl: 'http://localhost:3001',
    runTimeoutMs: 55_000,
    pollIntervalMs: 2_000,
    enableBlastRadius: false,
    ...overrides,
  };
  return { api, config };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('INSTRUCTIONS', () => {
  it('is at most 400 chars, so it stays cheap to load on every session', () => {
    expect(INSTRUCTIONS.length).toBeLessThanOrEqual(400);
  });
});

describe('buildMcpServer', () => {
  it('always registers the four core tools', () => {
    buildMcpServer(fakeDeps());
    expect(mocks.registerListAgents).toHaveBeenCalledTimes(1);
    expect(mocks.registerRunAgentOnPr).toHaveBeenCalledTimes(1);
    expect(mocks.registerGetFindings).toHaveBeenCalledTimes(1);
    expect(mocks.registerGetConventions).toHaveBeenCalledTimes(1);
  });

  it('does NOT register get_blast_radius unless the flag is set', () => {
    buildMcpServer(fakeDeps({ enableBlastRadius: false }));
    expect(mocks.registerGetBlastRadius).not.toHaveBeenCalled();
  });

  it('registers get_blast_radius when DEVDIGEST_MCP_ENABLE_BLAST_RADIUS is set', () => {
    buildMcpServer(fakeDeps({ enableBlastRadius: true }));
    expect(mocks.registerGetBlastRadius).toHaveBeenCalledTimes(1);
  });

  it('advertises INSTRUCTIONS verbatim to a connected client', async () => {
    const server = buildMcpServer(fakeDeps());
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      expect(client.getInstructions()).toBe(INSTRUCTIONS);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
