import { describe, it, expect } from 'vitest';
import { BlastRadius } from '@devdigest/shared';
import { buildSummary, toBlastRadius, type BlastFacadeResult } from './blast-map.js';

/**
 * Hermetic, no DB — `toBlastRadius`/`buildSummary` are pure transforms over
 * `BlastFacadeResult` (the structural mirror of repo-intel's `BlastResult`).
 */

function baseResult(overrides: Partial<BlastFacadeResult> = {}): BlastFacadeResult {
  return {
    changedSymbols: [
      { file: 'src/billing.ts', name: 'chargeCard', kind: 'function' },
      { file: 'src/webhook.ts', name: 'handleWebhook', kind: 'function' },
      { file: 'src/unused.ts', name: 'unusedFn', kind: 'function' },
    ],
    callers: [
      { file: 'src/webhook.ts', symbol: 'handleWebhook', viaSymbol: 'chargeCard', line: 42, rank: 5 },
      { file: 'src/cron/retry.ts', symbol: 'retryCharge', viaSymbol: 'chargeCard', line: 10, rank: 2 },
      // exact duplicate of the first caller row — must be deduped.
      { file: 'src/webhook.ts', symbol: 'handleWebhook', viaSymbol: 'chargeCard', line: 42, rank: 5 },
      { file: 'src/api/hooks.ts', symbol: 'stripeHook', viaSymbol: 'handleWebhook', line: 7, rank: 1 },
    ],
    impactedEndpoints: ['POST /webhooks/stripe', 'GET /billing'],
    factsByFile: {
      'src/webhook.ts': { endpoints: ['POST /webhooks/stripe'], crons: [] },
      'src/cron/retry.ts': { endpoints: [], crons: ['nightly-retry'] },
      'src/api/hooks.ts': { endpoints: ['POST /hooks'], crons: [] },
    },
    ...overrides,
  };
}

describe('toBlastRadius', () => {
  it('groups callers by viaSymbol in changedSymbols order, mapping/dedup-ing each caller and unioning per-file facts', () => {
    const result = baseResult();
    const blast = toBlastRadius(result);

    // `unusedFn` has no callers — excluded from `downstream`, but the two
    // symbols that DO have callers appear in `changedSymbols` order.
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['chargeCard', 'handleWebhook']);

    const chargeCard = blast.downstream[0]!;
    // Caller mapping is {name: c.symbol, file, line}; the exact-duplicate
    // caller row collapses, the facade's own order is preserved.
    expect(chargeCard.callers).toEqual([
      { name: 'handleWebhook', file: 'src/webhook.ts', line: 42 },
      { name: 'retryCharge', file: 'src/cron/retry.ts', line: 10 },
    ]);
    // Union of factsByFile over this group's OWN caller files only.
    expect(chargeCard.endpoints_affected).toEqual(['POST /webhooks/stripe']);
    expect(chargeCard.crons_affected).toEqual(['nightly-retry']);

    const handleWebhook = blast.downstream[1]!;
    expect(handleWebhook.callers).toEqual([{ name: 'stripeHook', file: 'src/api/hooks.ts', line: 7 }]);
    expect(handleWebhook.endpoints_affected).toEqual(['POST /hooks']);
    expect(handleWebhook.crons_affected).toEqual([]);

    expect(BlastRadius.parse(blast)).toBeTruthy();
  });

  it('keeps a zero-caller symbol in changed_symbols even though it is excluded from downstream', () => {
    const blast = toBlastRadius(baseResult());
    expect(blast.changed_symbols.map((s) => s.name)).toEqual([
      'chargeCard',
      'handleWebhook',
      'unusedFn',
    ]);
    expect(blast.downstream.some((d) => d.symbol === 'unusedFn')).toBe(false);
  });

  it('returns empty endpoint/cron chips when factsByFile is absent — never backfills from the flat impactedEndpoints', () => {
    const result = baseResult({ factsByFile: undefined });
    const blast = toBlastRadius(result);

    expect(result.impactedEndpoints.length).toBeGreaterThan(0); // sanity: the flat field IS populated
    for (const d of blast.downstream) {
      expect(d.endpoints_affected).toEqual([]);
      expect(d.crons_affected).toEqual([]);
    }
    expect(BlastRadius.parse(blast)).toBeTruthy();
  });

  it('passes degraded/reason through when the facade sets them', () => {
    const blast = toBlastRadius(baseResult({ degraded: true, reason: 'index_partial' }));
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_partial');
    expect(BlastRadius.parse(blast)).toBeTruthy();
  });

  it('omits degraded/reason keys entirely when the facade does not set them (not `undefined` values)', () => {
    const blast = toBlastRadius(baseResult());
    expect('degraded' in blast).toBe(false);
    expect('reason' in blast).toBe(false);
    // Round-trips cleanly through JSON — an `undefined` value would survive
    // in-memory but vanish on serialize, which is exactly the trap this guards.
    expect(JSON.parse(JSON.stringify(blast))).toEqual(blast);
  });
});

describe('buildSummary', () => {
  it('joins singular/plural labels correctly, with endpoints/crons deduped across ALL groups', () => {
    const blast = toBlastRadius(baseResult());
    // 3 changed symbols (incl. the zero-caller one) · 3 callers total (2 + 1)
    // · 2 unique endpoints across both groups · 1 cron.
    expect(blast.summary).toBe('3 changed symbols · 3 callers · 2 endpoints · 1 cron');
  });

  it('uses singular labels at exactly 1 and 0 falls back to the plural label', () => {
    const summary = buildSummary(
      [{ name: 'onlyOne', file: 'a.ts', kind: 'function' }],
      [{ symbol: 'onlyOne', callers: [{ name: 'caller', file: 'b.ts', line: 1 }], endpoints_affected: [], crons_affected: [] }],
    );
    expect(summary).toBe('1 changed symbol · 1 caller · 0 endpoints · 0 crons');
  });
});
