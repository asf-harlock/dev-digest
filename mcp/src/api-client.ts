/**
 * Thin HTTP client for `@devdigest/api` (:3001). The only place in `mcp/`
 * that talks to the network — translates HTTP outcomes into `McpToolError`s
 * so every caller deals with one error taxonomy (see `errors.ts`).
 */
import type { Agent, ConventionsSnapshot, RunSummary } from '@devdigest/shared';
import type { McpConfig } from './config.js';
import { apiUnavailable, McpToolError } from './errors.js';
import type { ReviewDtoLite } from './types.js';

export interface DevDigestApi {
  listAgents(): Promise<Agent[]>;
  lookupRepo(fullName: string): Promise<{ id: string; full_name: string; name: string }>;
  lookupPull(
    repoId: string,
    number: number,
  ): Promise<{ id: string; repo_id: string; number: number; title: string }>;
  /** First run of the response — `POST /pulls/:id/review` fans out per-agent, but the
   *  MCP only ever asks for one agent at a time. */
  startReview(prId: string, agentId: string): Promise<{ run_id: string }>;
  getRun(runId: string): Promise<RunSummary>;
  getRunFindings(runId: string): Promise<ReviewDtoLite>;
  getConventions(repoId: string): Promise<ConventionsSnapshot>;
}

/** Minimal shape this module needs from a `fetch` response — lets tests pass
 *  a plain object instead of a real `Response`. The global `fetch`'s return
 *  type structurally satisfies this. */
export interface ApiFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  json(): Promise<unknown>;
  clone(): ApiFetchResponse;
}

export type ApiFetch = (url: string, init?: RequestInit) => Promise<ApiFetchResponse>;

interface ErrorBody {
  error?: { message?: string };
  message?: string;
}

async function extractErrorMessage(res: ApiFetchResponse): Promise<string> {
  try {
    const body = (await res.clone().json()) as ErrorBody;
    return body?.error?.message ?? body?.message ?? res.statusText ?? `HTTP ${res.status}`;
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

export function createApiClient(cfg: McpConfig, fetchImpl: ApiFetch = fetch): DevDigestApi {
  async function call<T>(path: string, init: RequestInit = { method: 'GET' }): Promise<T> {
    let res: ApiFetchResponse;
    try {
      res = await fetchImpl(`${cfg.apiUrl}${path}`, init);
    } catch {
      throw apiUnavailable(cfg.apiUrl);
    }
    if (!res.ok) {
      const message = await extractErrorMessage(res);
      if (res.status === 404) throw new McpToolError('not_found', message);
      if (res.status === 429) throw new McpToolError('rate_limited', message);
      if (res.status === 400 || res.status === 422) throw new McpToolError('bad_request', message);
      // The server's generic 500 branch forwards raw exception messages (DB
      // errors etc.), so never relay its text for an unexpected status.
      console.error(`[devdigest-mcp] API ${res.status} on ${path}: ${message}`);
      throw new McpToolError(
        'internal',
        `DevDigest API returned HTTP ${res.status}. Check the API logs, then retry.`,
      );
    }
    return (await res.json()) as T;
  }

  return {
    listAgents: () => call<Agent[]>('/agents'),

    lookupRepo: (fullName) =>
      call(`/repos/lookup?full_name=${encodeURIComponent(fullName)}`),

    lookupPull: (repoId, number) => call(`/repos/${repoId}/pulls/lookup?number=${number}`),

    startReview: async (prId, agentId) => {
      const result = await call<{
        pr_id: string;
        runs: { run_id: string; agent_id: string; agent_name: string }[];
      }>(`/pulls/${prId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      const first = result.runs[0];
      if (!first) {
        throw new McpToolError('internal', 'DevDigest API did not start a review run.');
      }
      return { run_id: first.run_id };
    },

    getRun: (runId) => call<RunSummary>(`/runs/${runId}`),

    getRunFindings: (runId) => call<ReviewDtoLite>(`/runs/${runId}/findings`),

    getConventions: (repoId) => call<ConventionsSnapshot>(`/repos/${repoId}/conventions`),
  };
}
