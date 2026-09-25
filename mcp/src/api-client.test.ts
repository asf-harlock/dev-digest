import { describe, expect, it, vi } from 'vitest';
import type { ApiFetch, ApiFetchResponse } from './api-client.js';
import { createApiClient } from './api-client.js';
import type { McpConfig } from './config.js';
import { McpToolError } from './errors.js';

const config: McpConfig = {
  apiUrl: 'http://localhost:3001',
  runTimeoutMs: 55_000,
  pollIntervalMs: 2_000,
  enableBlastRadius: false,
};

function jsonResponse(status: number, body: unknown, statusText = ''): ApiFetchResponse {
  const response: ApiFetchResponse = {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    clone: () => response,
  };
  return response;
}

describe('createApiClient — error mapping', () => {
  it('maps a network failure to api_unavailable', async () => {
    const fetchImpl: ApiFetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const api = createApiClient(config, fetchImpl);

    await expect(api.listAgents()).rejects.toMatchObject({
      code: 'api_unavailable',
    } satisfies Partial<McpToolError>);
  });

  it('maps a 404 to not_found, using the server message', async () => {
    const fetchImpl: ApiFetch = vi.fn(async () =>
      jsonResponse(404, { error: { code: 'not_found', message: 'Repo not found' } }),
    );
    const api = createApiClient(config, fetchImpl);

    const err = await api.lookupRepo('acme/payments-api').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).code).toBe('not_found');
    expect((err as McpToolError).message).toBe('Repo not found');
  });

  it('maps a 429 to rate_limited', async () => {
    const fetchImpl: ApiFetch = vi.fn(async () =>
      jsonResponse(429, { message: 'Rate limit exceeded, retry in 1 minute' }),
    );
    const api = createApiClient(config, fetchImpl);

    const err = await api.startReview('pr-1', 'agent-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).code).toBe('rate_limited');
  });

  it('maps a 400 to bad_request', async () => {
    const fetchImpl: ApiFetch = vi.fn(async () =>
      jsonResponse(400, { error: { message: 'number is not a positive int' } }),
    );
    const api = createApiClient(config, fetchImpl);

    const err = await api.lookupPull('repo-1', -1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).code).toBe('bad_request');
  });

  it('maps a 422 to bad_request', async () => {
    const fetchImpl: ApiFetch = vi.fn(async () =>
      jsonResponse(422, { error: { code: 'validation_error', message: 'Request validation failed' } }),
    );
    const api = createApiClient(config, fetchImpl);

    const err = await api.lookupPull('repo-1', -1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).code).toBe('bad_request');
  });

  it('maps any other non-2xx status to internal', async () => {
    const fetchImpl: ApiFetch = vi.fn(async () => jsonResponse(500, { error: { message: 'boom' } }));
    const api = createApiClient(config, fetchImpl);

    const err = await api.getRun('run-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(McpToolError);
    expect((err as McpToolError).code).toBe('internal');
    // Never relays the server's raw 500 text (it can carry DB/internal detail).
    expect((err as McpToolError).message).not.toContain('boom');
    expect((err as McpToolError).message).toBe('DevDigest API returned HTTP 500. Check the API logs, then retry.');
  });
});

describe('createApiClient — happy paths', () => {
  it('listAgents: GET /agents', async () => {
    const agents = [{ id: 'a1', name: 'Reviewer' }];
    const fetchImpl: ApiFetch = vi.fn(async () => jsonResponse(200, agents));
    const api = createApiClient(config, fetchImpl);

    await expect(api.listAgents()).resolves.toEqual(agents);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3001/agents',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('lookupRepo: GET /repos/lookup?full_name=...', async () => {
    const repo = { id: 'r1', full_name: 'acme/payments-api', name: 'payments-api' };
    const fetchImpl: ApiFetch = vi.fn(async () => jsonResponse(200, repo));
    const api = createApiClient(config, fetchImpl);

    await expect(api.lookupRepo('acme/payments-api')).resolves.toEqual(repo);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3001/repos/lookup?full_name=acme%2Fpayments-api',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('lookupPull: GET /repos/:id/pulls/lookup?number=N', async () => {
    const pull = { id: 'p1', repo_id: 'r1', number: 482, title: 'Add feature' };
    const fetchImpl: ApiFetch = vi.fn(async () => jsonResponse(200, pull));
    const api = createApiClient(config, fetchImpl);

    await expect(api.lookupPull('r1', 482)).resolves.toEqual(pull);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3001/repos/r1/pulls/lookup?number=482',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('startReview: POST /pulls/:id/review {agentId}, returns the first run', async () => {
    const body = {
      pr_id: 'p1',
      runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Reviewer' }],
      reviews: [],
    };
    const fetchImpl: ApiFetch = vi.fn(async () => jsonResponse(200, body));
    const api = createApiClient(config, fetchImpl);

    await expect(api.startReview('p1', 'agent-1')).resolves.toEqual({ run_id: 'run-1' });
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3001/pulls/p1/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'agent-1' }),
    });
  });

  it('getRun: GET /runs/:id', async () => {
    const run = { run_id: 'run-1', status: 'done' };
    const fetchImpl: ApiFetch = vi.fn(async () => jsonResponse(200, run));
    const api = createApiClient(config, fetchImpl);

    await expect(api.getRun('run-1')).resolves.toEqual(run);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3001/runs/run-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('getRunFindings: GET /runs/:id/findings', async () => {
    const review = { run_id: 'run-1', verdict: 'approve', summary: 'ok', score: 95, findings: [] };
    const fetchImpl: ApiFetch = vi.fn(async () => jsonResponse(200, review));
    const api = createApiClient(config, fetchImpl);

    await expect(api.getRunFindings('run-1')).resolves.toEqual(review);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3001/runs/run-1/findings',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('getConventions: GET /repos/:id/conventions', async () => {
    const snapshot = { scan: null, candidates: [] };
    const fetchImpl: ApiFetch = vi.fn(async () => jsonResponse(200, snapshot));
    const api = createApiClient(config, fetchImpl);

    await expect(api.getConventions('r1')).resolves.toEqual(snapshot);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:3001/repos/r1/conventions',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
