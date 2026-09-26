#!/usr/bin/env node
/**
 * Entry point: stdio transport. Nothing in this process may write to
 * stdout — that stream is JSON-RPC protocol traffic only. All diagnostics
 * go to stderr via `console.error`.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createApiClient } from './api-client.js';
import { loadConfig } from './config.js';
import { buildMcpServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const api = createApiClient(config);
  const server = buildMcpServer({ api, config });
  const transport = new StdioServerTransport();

  const shutdown = (reason: string) => {
    console.error(`[devdigest-mcp] shutting down (${reason})`);
    server
      .close()
      .catch((err: unknown) => console.error('[devdigest-mcp] error while closing', err))
      .finally(() => process.exit(0));
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  // The client closes stdin when it disconnects; treat that the same as a
  // signal to exit, instead of spinning on a half-closed pipe.
  process.stdin.once('close', () => shutdown('stdin closed'));

  await server.connect(transport);
  console.error(`[devdigest-mcp] ready — API at ${config.apiUrl}`);
}

main().catch((err: unknown) => {
  console.error('[devdigest-mcp] fatal error', err);
  process.exit(1);
});
