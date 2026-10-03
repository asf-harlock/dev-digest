import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff — the group order the UI renders in: core → tests → wiring →
 * docs → boilerplate. This is also the enum's own declaration order
 * (`SmartDiffRole` in `vendor/shared/contracts/brief.ts`), so a group never
 * needs a separate "display order" table to drift from the contract.
 */
export const SMART_DIFF_ROLE_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];
