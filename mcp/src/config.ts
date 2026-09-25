/**
 * Runtime configuration for the devdigest-mcp stdio server. Read once at
 * startup from `process.env` — see `mcp/README.md` for the full list of
 * variables and their defaults.
 */

export interface McpConfig {
  apiUrl: string;
  runTimeoutMs: number;
  pollIntervalMs: number;
  enableBlastRadius: boolean;
}

const DEFAULT_API_URL = 'http://localhost:3001';
const DEFAULT_RUN_TIMEOUT_MS = 55_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const apiUrl = env.DEVDIGEST_API_URL?.trim();
  return {
    apiUrl: apiUrl && apiUrl.length > 0 ? apiUrl : DEFAULT_API_URL,
    runTimeoutMs: parsePositiveInt(env.DEVDIGEST_MCP_RUN_TIMEOUT_MS, DEFAULT_RUN_TIMEOUT_MS),
    pollIntervalMs: parsePositiveInt(env.DEVDIGEST_MCP_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
    enableBlastRadius: env.DEVDIGEST_MCP_ENABLE_BLAST_RADIUS === 'true',
  };
}
