/**
 * `get_conventions` — read-only tool surfacing this repo's ACCEPTED coding
 * conventions (house rules), so a caller can check a PR against them
 * alongside (or instead of) `run_agent_on_pr`. Pending/rejected candidates
 * are never surfaced — a human triages those in the web UI, not through
 * this tool. `rule` is free text extracted from the repo's own source, so it
 * is wrapped as untrusted before it reaches a client.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toToolErrorResult } from '../errors.js';
import { resolveRepo } from '../resolvers.js';
import { newNonce, UNTRUSTED_NOTE, wrapUntrusted } from '../security.js';
import type { ToolDeps } from '../server.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// `z.object(...)` schemas, NOT raw `{key: zodSchema}` shapes — passing a raw
// shape here makes the SDK's `registerTool` generic infer a
// `Record<string, AnySchema>` and structurally compare every property
// against `z3.ZodTypeAny | z4.$ZodType`, which blows up with
// "Type instantiation is excessively deep and possibly infinite" (TS2589)
// on TS 5.9 + @modelcontextprotocol/sdk 1.30.1's zod-compat layer. A single
// object schema is assignable to `AnySchema` directly, without that
// per-property recursion.
const inputSchema = z.object({
  repo: z.string().min(1).describe("Repo full name, 'owner/name'."),
  limit: z.number().int().positive().max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

const RuleSchema = z.object({
  id: z.string(),
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
});

const outputSchema = z.object({
  repo: z.string(),
  scanned: z.boolean(),
  rules: z.array(RuleSchema),
  total: z.number().int(),
  truncated: z.boolean(),
  note: z.string().optional(),
});

const NOT_SCANNED_NOTE =
  "This repo hasn't been scanned for conventions yet. Run a scan from the Conventions page in the web UI, or POST /repos/:id/conventions/extract.";

const ZERO_ACCEPTED_NOTE =
  'No accepted conventions yet — candidates are pending review in the web UI.';

export function registerGetConventions(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_conventions',
    {
      title: 'Get repo conventions',
      description:
        "Get this repo's accepted coding conventions (house rules) — only candidates with status 'accepted' are returned. If the repo was never scanned, or has no accepted rules yet, the response explains what to do next.",
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
    },
    async ({ repo, limit }) => {
      try {
        const resolved = await resolveRepo(deps.api, repo);
        const snapshot = await deps.api.getConventions(resolved.id);
        const scanned = snapshot.scan !== null;
        const accepted = snapshot.candidates.filter((candidate) => candidate.status === 'accepted');
        const total = accepted.length;
        const truncated = total > limit;
        const nonce = newNonce();
        const rules = accepted.slice(0, limit).map((candidate) => ({
          id: candidate.id,
          category: candidate.category,
          rule: wrapUntrusted(candidate.rule, nonce),
          evidence_path: candidate.evidence.path,
        }));

        let note: string | undefined;
        if (!scanned) {
          note = NOT_SCANNED_NOTE;
        } else if (rules.length === 0) {
          note = ZERO_ACCEPTED_NOTE;
        } else {
          note = UNTRUSTED_NOTE;
        }

        const structuredContent = {
          repo: resolved.full_name,
          scanned,
          rules,
          total,
          truncated,
          note,
        };

        const summaryText = scanned
          ? `${total} accepted convention(s) for ${resolved.full_name}.`
          : `${resolved.full_name} has not been scanned for conventions yet.`;

        return {
          structuredContent,
          content: [{ type: 'text', text: summaryText }],
        };
      } catch (err) {
        return toToolErrorResult(err);
      }
    },
  );
}
