import type { ConventionCandidate, ConventionScan } from '@devdigest/shared';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import type { DevDigestApi } from '../api-client.js';
import type { McpConfig } from '../config.js';
import { apiUnavailable, McpToolError } from '../errors.js';
import { UNTRUSTED_NOTE } from '../security.js';
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

const repo = { id: 'repo-1', full_name: 'acme/payments-api', name: 'payments-api' };

function fakeScan(overrides: Partial<ConventionScan> = {}): ConventionScan {
  return {
    id: 'scan-1',
    repo_id: 'repo-1',
    sample_file_count: 12,
    config_file_count: 3,
    candidate_count: 4,
    mode: 'local',
    provider: null,
    model: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function fakeCandidate(overrides: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: 'cand-1',
    scan_id: 'scan-1',
    category: 'naming',
    rule: 'Use camelCase for variable names',
    evidence: { path: 'src/foo.ts', start_line: 1, end_line: 3, snippet: 'const fooBar = 1;' },
    confidence: 0.9,
    status: 'accepted',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

interface StructuredResult {
  repo: string;
  scanned: boolean;
  rules: { id: string; category: string; rule: string; evidence_path: string }[];
  total: number;
  truncated: boolean;
  note?: string;
}

describe('get_conventions', () => {
  it('returns only accepted candidates, each with a nonce-wrapped rule', async () => {
    const accepted1 = fakeCandidate({ id: 'c1', rule: 'Rule one' });
    const accepted2 = fakeCandidate({ id: 'c2', rule: 'Rule two', category: 'style' });
    const pending = fakeCandidate({ id: 'c3', status: 'pending' });
    const rejected = fakeCandidate({ id: 'c4', status: 'rejected' });

    const { client, server } = await connect(
      fakeApi({
        lookupRepo: async () => repo,
        getConventions: async () => ({
          scan: fakeScan(),
          candidates: [accepted1, pending, accepted2, rejected],
        }),
      }),
    );
    try {
      const result = await client.callTool({
        name: 'get_conventions',
        arguments: { repo: 'acme/payments-api' },
      });
      expect(result.isError).toBeFalsy();
      const structured = result.structuredContent as unknown as StructuredResult;

      expect(structured.repo).toBe('acme/payments-api');
      expect(structured.scanned).toBe(true);
      expect(structured.total).toBe(2);
      expect(structured.truncated).toBe(false);
      expect(structured.rules.map((r) => r.id)).toEqual(['c1', 'c2']);
      expect(structured.note).toBe(UNTRUSTED_NOTE);

      // Every rule is wrapped in the SAME nonce boundary for this response.
      const nonces = new Set(
        structured.rules.map((r) => {
          const match = /^<untrusted-([0-9a-f]{12})>/.exec(r.rule);
          if (!match) throw new Error(`rule not wrapped: ${r.rule}`);
          return match[1];
        }),
      );
      expect(nonces.size).toBe(1);
      const [nonce] = [...nonces];
      expect(structured.rules[0]?.rule).toBe(`<untrusted-${nonce}>Rule one</untrusted-${nonce}>`);
      expect(structured.rules[1]?.rule).toBe(`<untrusted-${nonce}>Rule two</untrusted-${nonce}>`);
      expect(structured.rules[0]?.evidence_path).toBe('src/foo.ts');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('explains how to run a scan when the repo was never scanned', async () => {
    const { client, server } = await connect(
      fakeApi({
        lookupRepo: async () => repo,
        getConventions: async () => ({ scan: null, candidates: [] }),
      }),
    );
    try {
      const result = await client.callTool({
        name: 'get_conventions',
        arguments: { repo: 'acme/payments-api' },
      });
      expect(result.isError).toBeFalsy();
      const structured = result.structuredContent as unknown as StructuredResult;
      expect(structured.scanned).toBe(false);
      expect(structured.rules).toEqual([]);
      expect(structured.total).toBe(0);
      expect(structured.note).toContain('conventions/extract');
      expect(structured.note).not.toBe(UNTRUSTED_NOTE);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('says candidates are pending review when scanned but nothing is accepted yet', async () => {
    const pending = fakeCandidate({ id: 'c1', status: 'pending' });
    const rejected = fakeCandidate({ id: 'c2', status: 'rejected' });
    const { client, server } = await connect(
      fakeApi({
        lookupRepo: async () => repo,
        getConventions: async () => ({ scan: fakeScan(), candidates: [pending, rejected] }),
      }),
    );
    try {
      const result = await client.callTool({
        name: 'get_conventions',
        arguments: { repo: 'acme/payments-api' },
      });
      expect(result.isError).toBeFalsy();
      const structured = result.structuredContent as unknown as StructuredResult;
      expect(structured.scanned).toBe(true);
      expect(structured.rules).toEqual([]);
      expect(structured.total).toBe(0);
      expect(structured.note).toContain('pending review');
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('caps rules at `limit` and sets truncated:true, while `total` counts all accepted', async () => {
    const candidates = [
      fakeCandidate({ id: 'c1' }),
      fakeCandidate({ id: 'c2' }),
      fakeCandidate({ id: 'c3' }),
    ];
    const { client, server } = await connect(
      fakeApi({
        lookupRepo: async () => repo,
        getConventions: async () => ({ scan: fakeScan(), candidates }),
      }),
    );
    try {
      const result = await client.callTool({
        name: 'get_conventions',
        arguments: { repo: 'acme/payments-api', limit: 2 },
      });
      expect(result.isError).toBeFalsy();
      const structured = result.structuredContent as unknown as StructuredResult;
      expect(structured.total).toBe(3);
      expect(structured.truncated).toBe(true);
      expect(structured.rules).toHaveLength(2);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('returns not_found with the plan hint when the repo does not exist', async () => {
    const { client, server } = await connect(fakeApi());
    try {
      const result = await client.callTool({
        name: 'get_conventions',
        arguments: { repo: 'acme/missing' },
      });
      expect(result.isError).toBe(true);
      const content = result.content as { type: string; text: string }[];
      expect(content[0]?.text).toBe(
        "not_found: Repo 'acme/missing' not found. Add it in the web UI, then retry.",
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('surfaces api_unavailable as an isError result', async () => {
    const { client, server } = await connect(
      fakeApi({
        lookupRepo: async () => repo,
        getConventions: async () => {
          throw apiUnavailable('http://localhost:3001');
        },
      }),
    );
    try {
      const result = await client.callTool({
        name: 'get_conventions',
        arguments: { repo: 'acme/payments-api' },
      });
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
