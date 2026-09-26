/**
 * `get_blast_radius` — read-only tool surfacing a PR's impact map: which
 * symbols it changes, who calls them, and which HTTP endpoints/cron jobs are
 * reachable from those callers. Best-effort over `repo-intel`
 * (`GET /pulls/:id/blast`, `server/src/modules/blast/service.ts`), which
 * degrades rather than throws — a caller checks `degraded`/`reason`, not an
 * error, to know the map may be incomplete.
 */
import type { BlastDegradedReason } from '@devdigest/shared';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { toToolErrorResult } from '../errors.js';
import { REPO_ARG_DESCRIPTION, resolvePull, resolveRepo } from '../resolvers.js';
import { newNonce, UNTRUSTED_NOTE, wrapUntrusted } from '../security.js';
import type { ToolDeps } from '../server.js';
import type { Blast } from '../types.js';

// `z.object(...)` schemas, NOT raw `{key: zodSchema}` shapes — see
// `get-conventions.ts`'s comment (TS2589 `registerTool` type instantiation
// blowup with the SDK's zod-compat layer on a raw shape).
const inputSchema = z.object({
  repo: z.string().min(1).describe(REPO_ARG_DESCRIPTION),
  pr: z.number().int().positive().describe('Pull request number.'),
});

const ChangedSymbolSchema = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});

const BlastCallerSchema = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});

const DownstreamImpactSchema = z.object({
  symbol: z.string(),
  callers: z.array(BlastCallerSchema),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
});

// Mirrors `BlastDegradedReason` (`server/src/vendor/shared/contracts/brief.ts`)
// — kept as a local literal list rather than a runtime import, per the
// `@devdigest/shared` "type-only" rule (a value import would pull server
// code into this process). `satisfies` + the exhaustiveness check below make
// `tsc` fail when the contract gains or loses a reason; otherwise the SDK's
// outputSchema validation would reject every degraded call at runtime.
const BLAST_DEGRADED_REASONS = [
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
] as const satisfies readonly BlastDegradedReason[];
type MissingReason = Exclude<BlastDegradedReason, (typeof BLAST_DEGRADED_REASONS)[number]>;
const reasonsAreExhaustive: [MissingReason] extends [never] ? true : MissingReason = true;
void reasonsAreExhaustive;
const BlastDegradedReasonSchema = z.enum(BLAST_DEGRADED_REASONS);

const outputSchema = z.object({
  changed_symbols: z.array(ChangedSymbolSchema),
  downstream: z.array(DownstreamImpactSchema),
  summary: z.string(),
  degraded: z.boolean().optional(),
  reason: BlastDegradedReasonSchema.optional(),
  note: z.string().optional(),
});

const DEGRADED_NOTE =
  "This impact map is degraded — the repo index is missing or incomplete, so it may under-report callers. Resync the repo's index from its page in the web UI, then retry.";

/**
 * Fences every repo-sourced string in a `Blast` with ONE per-call nonce
 * before it reaches structuredContent — `changed_symbols[].name/.file`,
 * `downstream[].symbol`, `callers[].name/.file` and every
 * `endpoints_affected`/`crons_affected` entry all originate in the repo (a
 * symbol/file name, or an endpoint literal recovered by regex from arbitrary
 * route source — `server/src/adapters/codeindex/extract.ts`), so none of
 * them is trustworthy instruction text (LLM01 prompt injection).
 *
 * `numbers`, `kind`, `summary`, `degraded` and `reason` are left as-is: `kind`
 * is one of a fixed small set of AST node kinds, not free text, and
 * `summary` is computed server-side from counts, never copied from the repo.
 *
 * This only re-wraps values — no regrouping, reordering or recomputing, so
 * the relayed map stays identical to the route's (`mcp/CLAUDE.md` Gotchas).
 */
function wrapBlast(blast: Blast, nonce: string): Blast {
  const wrap = (s: string) => wrapUntrusted(s, nonce);
  return {
    changed_symbols: blast.changed_symbols.map((s) => ({
      name: wrap(s.name),
      file: wrap(s.file),
      kind: s.kind,
    })),
    downstream: blast.downstream.map((d) => ({
      symbol: wrap(d.symbol),
      callers: d.callers.map((c) => ({ name: wrap(c.name), file: wrap(c.file), line: c.line })),
      endpoints_affected: d.endpoints_affected.map(wrap),
      crons_affected: d.crons_affected.map(wrap),
    })),
    summary: blast.summary,
    ...(blast.degraded !== undefined ? { degraded: blast.degraded } : {}),
    ...(blast.reason !== undefined ? { reason: blast.reason } : {}),
  };
}

export function registerGetBlastRadius(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get blast radius',
      description:
        "Get a PR's impact map: the symbols it changes, their callers, and any HTTP endpoints/cron jobs reachable from those callers. Call it before approving a PR that touches shared code, to see what else it could break. When the repo index is missing or incomplete the map is best-effort — check `degraded`/`reason` in the result and the note for what to do next.",
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
        destructiveHint: false,
      },
    },
    async ({ repo, pr }) => {
      try {
        const resolvedRepo = await resolveRepo(deps.api, repo);
        const pull = await resolvePull(deps.api, resolvedRepo.id, resolvedRepo.full_name, pr);
        const blast = await deps.api.getBlast(pull.id);

        const nonce = newNonce();
        const note = blast.degraded ? `${DEGRADED_NOTE} ${UNTRUSTED_NOTE}` : UNTRUSTED_NOTE;
        const structuredContent = { ...wrapBlast(blast, nonce), note };

        return {
          structuredContent,
          content: [{ type: 'text', text: wrapUntrusted(blast.summary, nonce) }],
        };
      } catch (err) {
        return toToolErrorResult(err);
      }
    },
  );
}
