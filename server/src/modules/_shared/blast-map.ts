import type { BlastCaller, BlastDegradedReason, BlastRadius, ChangedSymbol, DownstreamImpact } from '@devdigest/shared';

/**
 * Singular/plural label pairs for `buildSummary`'s "N label(s)" segments,
 * joined with ` · ` in this fixed order:
 * `"2 changed symbols · 14 callers · 3 endpoints · 1 cron"`.
 */
const SUMMARY_LABELS = {
  changedSymbols: ['changed symbol', 'changed symbols'],
  callers: ['caller', 'callers'],
  endpoints: ['endpoint', 'endpoints'],
  crons: ['cron', 'crons'],
} as const;

/**
 * Structural mirror of `repo-intel`'s `BlastResult` (`repo-intel/types.ts`),
 * declared independently rather than `import type … from
 * '../repo-intel/types.js'` — shared helpers may not cross-import another module
 * (`no-cross-module-import`), and purity additionally bars importing `platform/container.ts` (which is where the
 * real type would otherwise be reached through `Container['repoIntel']`).
 * `service.ts` calls `container.repoIntel.getBlastRadius(...)` and passes the
 * result straight into `toBlastRadius` — TypeScript matches the two shapes
 * structurally, no cast needed, as long as this mirror stays in sync.
 */
export interface BlastFacadeResult {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
  impactedEndpoints: string[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
}

/** Stable de-duplication that preserves first-seen order (unlike `Set` iteration order guarantees — spelled out because callers rely on it for the caller/endpoint/cron lists). */
function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function pluralize(count: number, [singular, plural]: readonly [string, string]): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Groups `result.callers` by `viaSymbol`, in the order their symbol first
 * appears in `result.changedSymbols` (deduping symbol names — `viaSymbol` is
 * a bare name, so two changed symbols that share a name collapse into one
 * group, same as the facade's own caller rows do). A symbol with zero callers
 * is omitted here (it still appears in `changed_symbols`).
 *
 * Per group:
 *   - `callers`: `{ name: c.symbol, file, line }`, in the facade's own order,
 *     de-duplicated by `file+line+name`.
 *   - `endpoints_affected`/`crons_affected`: a stable de-duplicated union of
 *     `result.factsByFile[file]` over the group's own caller files. `[]` when
 *     `factsByFile` is absent entirely — this never backfills from the flat
 *     `result.impactedEndpoints`, which has no per-symbol attribution.
 */
function buildDownstream(result: BlastFacadeResult): DownstreamImpact[] {
  const symbolOrder = uniqueOrdered(result.changedSymbols.map((s) => s.name));
  const downstream: DownstreamImpact[] = [];

  for (const symbolName of symbolOrder) {
    const matching = result.callers.filter((c) => c.viaSymbol === symbolName);
    if (matching.length === 0) continue;

    const callers: BlastCaller[] = [];
    const callerSeen = new Set<string>();
    for (const c of matching) {
      const key = `${c.file}|${c.line}|${c.symbol}`;
      if (callerSeen.has(key)) continue;
      callerSeen.add(key);
      callers.push({ name: c.symbol, file: c.file, line: c.line });
    }

    let endpoints_affected: string[] = [];
    let crons_affected: string[] = [];
    if (result.factsByFile) {
      const factsByFile = result.factsByFile;
      const callerFiles = uniqueOrdered(callers.map((c) => c.file));
      const endpoints: string[] = [];
      const crons: string[] = [];
      for (const file of callerFiles) {
        const facts = factsByFile[file];
        if (!facts) continue;
        endpoints.push(...facts.endpoints);
        crons.push(...facts.crons);
      }
      endpoints_affected = uniqueOrdered(endpoints);
      crons_affected = uniqueOrdered(crons);
    }

    downstream.push({ symbol: symbolName, callers, endpoints_affected, crons_affected });
  }

  return downstream;
}

/**
 * One line like `"2 changed symbols · 14 callers · 3 endpoints · 1 cron"`.
 * Callers = the total across every downstream group (already de-duplicated
 * per group); endpoints/crons = the unique union across ALL groups.
 */
export function buildSummary(changedSymbols: ChangedSymbol[], downstream: DownstreamImpact[]): string {
  const callerCount = downstream.reduce((sum, d) => sum + d.callers.length, 0);
  const endpoints = uniqueOrdered(downstream.flatMap((d) => d.endpoints_affected));
  const crons = uniqueOrdered(downstream.flatMap((d) => d.crons_affected));

  return [
    pluralize(changedSymbols.length, SUMMARY_LABELS.changedSymbols),
    pluralize(callerCount, SUMMARY_LABELS.callers),
    pluralize(endpoints.length, SUMMARY_LABELS.endpoints),
    pluralize(crons.length, SUMMARY_LABELS.crons),
  ].join(' · ');
}

/**
 * Maps `repo-intel`'s best-effort `BlastResult` onto the `BlastRadius`
 * contract. `degraded`/`reason` are passed through only when set — the
 * contract's `.optional()` fields must be OMITTED, not written as
 * `undefined`, to round-trip cleanly through JSON.
 */
export function toBlastRadius(result: BlastFacadeResult): BlastRadius {
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));
  const downstream = buildDownstream(result);
  const summary = buildSummary(changed_symbols, downstream);

  return {
    changed_symbols,
    downstream,
    summary,
    ...(result.degraded !== undefined ? { degraded: result.degraded } : {}),
    ...(result.reason !== undefined ? { reason: result.reason } : {}),
  };
}
