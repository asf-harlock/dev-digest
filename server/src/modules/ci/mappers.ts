import type { CiInstallation, CiRun } from '@devdigest/shared';
import type {
  AgentRow,
  CiInstallationWithAgent,
  CiLastRun,
  CiMemoryRow,
  CiRunRow,
} from './repository.js';
import { GITHUB_WEB_ORIGIN, WORKFLOW_VERSION } from './constants.js';
import { isTrustedJobUrl } from './helpers.js';
import type { ManifestAgent } from './manifest.js';
import type { MemoryExportRow } from './memory-export.js';

/**
 * Pure row -> DTO mapping for the `ci` module: a Drizzle row never leaves the
 * service layer unmapped.
 */

const TRIGGERS = ['opened', 'synchronize', 'reopened'] as const;

export function toCiInstallation(
  item: CiInstallationWithAgent,
  lastRun: CiLastRun | undefined,
): CiInstallation {
  const row = item.installation;
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: item.agentName,
    repo: row.repo,
    target_type: row.targetType,
    status: row.status,
    pr_url: row.prUrl,
    workflow_version: row.workflowVersion,
    agent_version: row.agentVersion,
    post_as: row.postAs,
    triggers: TRIGGERS.filter((t) => row.triggers.includes(t)),
    ci_fail_on: row.ciFailOn,
    installed_at: row.installedAt.toISOString(),
    last_refreshed_at: row.lastRefreshedAt ? row.lastRefreshedAt.toISOString() : null,
    update_available:
      row.workflowVersion < WORKFLOW_VERSION || row.agentVersion < item.agentVersion,
    last_run: lastRun
      ? { status: lastRun.status, ran_at: lastRun.ranAt ? lastRun.ranAt.toISOString() : null }
      : null,
  };
}

export function toCiRun(row: CiRunRow): CiRun {
  return {
    id: row.id,
    installation_id: row.ciInstallationId,
    repo: row.repo,
    agent_name: row.agentName,
    pr_number: row.prNumber,
    status: row.status,
    verdict: row.verdict,
    failure_reason: row.failureReason,
    findings_count: row.findingsCount,
    critical: row.critical,
    warning: row.warning,
    suggestion: row.suggestion,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    ran_at: row.ranAt ? row.ranAt.toISOString() : null,
    // Only a github.com run URL of the installation's own repository becomes a link (UI-11).
    job_url: isTrustedJobUrl(row.githubUrl, row.repo) ? row.githubUrl : null,
  };
}

/** The agent fields the manifest is built from. */
export function toManifestAgent(agent: AgentRow): ManifestAgent {
  return {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  };
}

/** A DB memory row as the exporter wants it (ISO `created_at`). */
export function toMemoryExportRow(row: CiMemoryRow): MemoryExportRow {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    confidence: row.confidence,
    created_at: row.createdAt.toISOString(),
  };
}

/** A pull-request URL GitHub returned, kept only when it is a github.com URL of `repo` (UI-12). */
export function trustedPrUrl(url: string, repo: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (`${parsed.protocol}//${parsed.host}` !== GITHUB_WEB_ORIGIN) return null;
  if (parsed.username !== '' || parsed.password !== '') return null;
  return parsed.pathname.toLowerCase().startsWith(`/${repo.toLowerCase()}/pull/`) ? url : null;
}
