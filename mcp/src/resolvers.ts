/**
 * Turns the flat, human-friendly tool arguments (`repo`, `pr`, `agent`) into
 * the uuids the API needs, with a not-found message that tells the user what
 * to do next rather than just "404".
 */
import type { Agent } from '@devdigest/shared';
import type { DevDigestApi } from './api-client.js';
import { McpToolError, notFound } from './errors.js';

function isNotFound(err: unknown): err is McpToolError {
  return err instanceof McpToolError && err.code === 'not_found';
}

export async function resolveRepo(
  api: DevDigestApi,
  repo: string,
): Promise<{ id: string; full_name: string; name: string }> {
  try {
    return await api.lookupRepo(repo);
  } catch (err) {
    if (isNotFound(err)) {
      throw notFound(`Repo '${repo}' not found. Add it in the web UI, then retry.`);
    }
    throw err;
  }
}

export async function resolvePull(
  api: DevDigestApi,
  repoId: string,
  repoFullName: string,
  pr: number,
): Promise<{ id: string; repo_id: string; number: number; title: string }> {
  try {
    return await api.lookupPull(repoId, pr);
  } catch (err) {
    if (isNotFound(err)) {
      throw notFound(`PR #${pr} not found in ${repoFullName}. Import PRs in the web UI, then retry.`);
    }
    throw err;
  }
}

/**
 * Matches `agent` against the id first (exact), then the name
 * (case-insensitive). Zero or 2+ name matches are both `not_found` — the
 * schema has no uniqueness constraint on `agents.name`.
 */
export async function resolveAgent(api: DevDigestApi, agent: string): Promise<Agent> {
  const agents = await api.listAgents();

  const byId = agents.find((a) => a.id === agent);
  if (byId) return byId;

  const needle = agent.toLowerCase();
  const byName = agents.filter((a) => a.name.toLowerCase() === needle);
  if (byName.length === 1) {
    const [match] = byName;
    if (match) return match;
  }
  if (byName.length > 1) {
    throw notFound(
      `Agent '${agent}' not found. Call list_agents to see valid ids/names — several agents share this name, pass the id.`,
    );
  }
  throw notFound(`Agent '${agent}' not found. Call list_agents to see valid ids/names.`);
}
