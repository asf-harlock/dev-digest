import type { SmartDiffRole } from '@devdigest/shared';
import { SMART_DIFF_RULES } from './constants.js';

/**
 * Classify one PR file path into a Smart Diff role. Pure — no DB, no
 * adapters, no fastify, no container — so L08 (or any future caller) can
 * import it without HTTP.
 *
 * First matching rule wins, walking `SMART_DIFF_RULES` in its declared
 * precedence order (boilerplate → tests → docs → wiring); a path that
 * matches nothing falls back to `core`.
 */
export function classifyFile(path: string): SmartDiffRole {
  const normalized = path.replace(/\\/g, '/');
  for (const { role, patterns } of SMART_DIFF_RULES) {
    if (patterns.some((re) => re.test(normalized))) return role;
  }
  return 'core';
}
