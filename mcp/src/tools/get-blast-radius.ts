/**
 * STUB — always returns `isError: true`. L04 homework: wire this to
 * `container.repoIntel.getBlastRadius` (`server/src/modules/repo-intel/service.ts:220`)
 * and shape the response per the `BlastRadius` contract
 * (`server/src/vendor/shared/contracts/brief.ts:53`).
 *
 * Registered only when `DEVDIGEST_MCP_ENABLE_BLAST_RADIUS=true` — `server.ts`
 * gates the call to `registerGetBlastRadius` behind `deps.config.enableBlastRadius`.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { McpToolError, toToolErrorResult } from '../errors.js';
import type { ToolDeps } from '../server.js';

export function registerGetBlastRadius(server: McpServer, _deps: ToolDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get blast radius (stub, not implemented)',
      description:
        'STUB — not implemented yet. Intended to report which other files and tests a PR is likely to affect. Always returns an error; do not retry.',
      inputSchema: {
        repo: z.string().describe("Repository full name, e.g. 'owner/name'."),
        pr: z.number().int().positive().describe('Pull request number.'),
      },
      annotations: {
        title: 'Get blast radius (stub, not implemented)',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      toToolErrorResult(
        new McpToolError(
          'not_implemented',
          'get_blast_radius is not implemented yet (L04 homework), do not retry.',
        ),
      ),
  );
}
