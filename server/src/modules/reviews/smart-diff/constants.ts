import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff — the group order the UI renders in: core → tests → wiring →
 * docs → boilerplate. This is also the enum's own declaration order
 * (`SmartDiffRole` in `vendor/shared/contracts/brief.ts`), so a group never
 * needs a separate "display order" table to drift from the contract.
 */
export const SMART_DIFF_ROLE_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

/**
 * Classification rules, in PRECEDENCE order (first match wins) — deliberately
 * NOT the same as `SMART_DIFF_ROLE_ORDER` (the display order):
 *
 *   boilerplate → tests → docs → wiring, with `core` as the fallback.
 *
 * Why boilerplate goes first: a lockfile or a `.snap` file must never be
 * reclassified by a broader pattern (e.g. a wiring `*.config.*` rule) that
 * happens to also match its extension.
 * Why tests goes next: a test file's own name (`*.test.ts`) is a stronger,
 * more specific signal than any directory-based wiring/docs rule it might
 * also sit under (e.g. `docs/examples/foo.test.ts` should still read as a
 * test, not documentation).
 * Why docs goes before wiring: a barrel `index.ts` living under `docs/`
 * (`docs/index.ts`) is prose-adjacent scaffolding, not application wiring —
 * checking `docs/**` before the wiring `index.ts` pattern is what makes that
 * distinction possible at all, since the wiring rule alone can't see the
 * directory it lives in.
 * `core` is the fallback, not a rule: it's every file none of the other four
 * roles claim, which is deliberately "the substance of the change".
 */
export const SMART_DIFF_RULES: { role: SmartDiffRole; patterns: RegExp[] }[] = [
  {
    role: 'boilerplate',
    patterns: [
      /(^|\/)package\.json$/,
      /(^|\/)package-lock\.json$/,
      /(^|\/)pnpm-lock\.yaml$/,
      /(^|\/)yarn\.lock$/,
      /\.snap$/,
      /(^|\/)__snapshots__\//,
      /\.generated\./,
      /(^|\/)dist\//,
      /(^|\/)db\/migrations\//,
      /\.min\.js$/,
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.test\.tsx?$/,
      /\.spec\.tsx?$/,
      /\.it\.test\.ts$/,
      /(^|\/)test\//,
      /(^|\/)__tests__\//,
      /(^|\/)e2e\//,
    ],
  },
  {
    role: 'docs',
    patterns: [/\.mdx?$/, /(^|\/)docs\//, /(^|\/)LICENSE$/],
  },
  {
    role: 'wiring',
    patterns: [
      /(^|\/)index\.ts$/,
      /(^|\/)server\.ts$/,
      /(^|\/)config\.ts$/,
      /\.config\.(ts|js|cjs|mjs)$/,
      /(^|\/)tsconfig[^/]*\.json$/,
      /(^|\/)Dockerfile$/,
      /(^|\/)\.github\/workflows\//,
      /(^|\/)\.env\.example$/,
    ],
  },
];
