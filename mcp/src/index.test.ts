/**
 * `index.ts` owns the stdio transport, so stdout MUST carry only JSON-RPC
 * protocol traffic — a stray `console.log` anywhere in `src/` would corrupt
 * every message a client reads. We don't spawn the real process here (that
 * would attach a live server to this test run's stdin/stdout); instead we
 * statically confirm no source file ever calls `console.log`, and that
 * `index.ts` only logs through `console.error`.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC_DIR = new URL('.', import.meta.url).pathname;

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return collectTsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('stdout hygiene', () => {
  it('no file under src/ calls console.log (stdout is JSON-RPC only)', () => {
    const offenders = collectTsFiles(SRC_DIR)
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('console.log('));

    expect(offenders).toEqual([]);
  });

  it('index.ts logs diagnostics via console.error only', () => {
    const source = readFileSync(join(SRC_DIR, 'index.ts'), 'utf8');
    expect(source).toContain('console.error');
    expect(source).not.toContain('console.log');
  });
});
