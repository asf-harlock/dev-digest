import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './smart-diff-roles.js';

/**
 * Smart Diff classifier — table-driven, pure-function coverage. Precedence is
 * deliberate: boilerplate → tests → docs → wiring, core as the fallback (see
 * `SMART_DIFF_RULES` in `smart-diff-roles.ts`).
 */
describe('classifyFile', () => {
  const cases: [string, SmartDiffRole][] = [
    // ---- core (default fallback) ----
    ['src/middleware/ratelimit.ts', 'core'],
    ['src/api/users.ts', 'core'],
    ['src/db/schema/reviews.ts', 'core'],

    // ---- tests ----
    ['src/foo.test.ts', 'tests'],
    ['src/foo.spec.tsx', 'tests'],
    ['src/middleware/ratelimit.it.test.ts', 'tests'],
    ['test/reviews-smart-diff.test.ts', 'tests'],
    ['__tests__/helpers.ts', 'tests'],
    ['e2e/specs/05-pr-diff.flow.json', 'tests'],

    // ---- wiring ----
    ['src/api/public/index.ts', 'wiring'],
    ['src/server.ts', 'wiring'],
    ['src/config.ts', 'wiring'],
    ['vitest.config.ts', 'wiring'],
    ['eslint.config.mjs', 'wiring'],
    ['tsconfig.json', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['Dockerfile', 'wiring'],
    ['.github/workflows/server-unit.yml', 'wiring'],
    ['.env.example', 'wiring'],

    // ---- docs ----
    ['README.md', 'docs'],
    ['docs/rate-limiting.md', 'docs'],
    ['docs/architecture.mdx', 'docs'],
    ['LICENSE', 'docs'],

    // ---- boilerplate ----
    ['package.json', 'boilerplate'],
    ['package-lock.json', 'boilerplate'],
    ['pnpm-lock.yaml', 'boilerplate'],
    ['yarn.lock', 'boilerplate'],
    ['__snapshots__/FileCard.test.tsx.snap', 'boilerplate'],
    ['src/components/x.generated.ts', 'boilerplate'],
    ['dist/index.js', 'boilerplate'],
    ['src/db/migrations/0016_smart_diff.sql', 'boilerplate'],
    ['vendor/lib.min.js', 'boilerplate'],

    // ---- precedence cases (plan step 2) ----
    // docs/index.ts → docs wins: rule order is boilerplate → tests → docs →
    // wiring, so the `docs/` rule matches before the `index.ts` wiring rule
    // ever gets a chance to.
    ['docs/index.ts', 'docs'],
    // __snapshots__/x.snap → boilerplate, not tests: boilerplate is checked
    // before tests in the precedence order.
    ['__snapshots__/x.snap', 'boilerplate'],
  ];

  for (const [path, role] of cases) {
    it(`${path} → ${role}`, () => {
      expect(classifyFile(path)).toBe(role);
    });
  }

  it('normalizes backslashes to forward slashes before matching', () => {
    expect(classifyFile('docs\\rate-limiting.md')).toBe('docs');
    expect(classifyFile('src\\server.ts')).toBe('wiring');
  });
});
