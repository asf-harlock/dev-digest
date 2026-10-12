import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * NFR-9 / NFR-10 — the SPEC-08 eval contracts exist in TWO physical copies of
 * `@devdigest/shared` (`server/src/vendor/shared` and `client/src/vendor/shared`)
 * and must be changed in the same commit.
 *
 * The two files as a whole are NOT identical — they carry pre-existing drift
 * that has nothing to do with eval (the client copy uses `.optional()` where the
 * server uses `.default()` for the onboarding tour and `context_paths`; the
 * server has `AgentManifest`, `AgentVersion*`, extra providers and CI docs
 * comments the client lacks). So this test compares ONLY the eval regions,
 * byte for byte, instead of normalising the drift away:
 *
 *   knowledge.ts  from `// ---- Eval ----`  up to `// ---- Memory ----`
 *                 (the case-side shapes, incl. `// ---- Eval — per-case outcome ----`)
 *   eval-ci.ts    from the `Eval — runs, overview, dashboard, compare (SPEC-08)`
 *                 banner up to the `Compose Review` banner
 *
 * Anything that drifts INSIDE a region fails the test; drift outside it is
 * deliberately ignored.
 */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const SERVER = '../src/vendor/shared/contracts/';
const CLIENT = '../../client/src/vendor/shared/contracts/';

/** The text from `start` (inclusive) to `end` (exclusive), failing loudly if a marker is gone. */
function between(src: string, start: string, end: string, label: string): string {
  const s = src.indexOf(start);
  const e = src.indexOf(end, s + start.length);
  if (s === -1 || e === -1) throw new Error(`${label}: marker not found (${s === -1 ? start : end})`);
  return src.slice(s, e);
}

/** Back up from a marker to the `// ====…` banner line that opens its section. */
function bannerStart(src: string, marker: string): number {
  const at = src.indexOf(marker);
  if (at === -1) throw new Error(`marker not found: ${marker}`);
  return src.lastIndexOf('// ====', at);
}

function knowledgeEvalRegion(src: string): string {
  return between(src, '// ---- Eval ----', '// ---- Memory ----', 'knowledge.ts');
}

function evalCiEvalRegion(src: string): string {
  const start = bannerStart(src, 'Eval — runs, overview, dashboard, compare (SPEC-08)');
  const end = bannerStart(src, '// Compose Review');
  if (end <= start) throw new Error('eval-ci.ts: Compose banner precedes the Eval banner');
  return src.slice(start, end);
}

const evalExports = (src: string): string[] =>
  [...src.matchAll(/^export (?:const|type) (Eval\w*)/gm)].map((m) => m[1]!).sort();

describe('NFR-9: eval contract parity between the server and client vendor copies', () => {
  const serverKnowledge = read(`${SERVER}knowledge.ts`);
  const clientKnowledge = read(`${CLIENT}knowledge.ts`);
  const serverEvalCi = read(`${SERVER}eval-ci.ts`);
  const clientEvalCi = read(`${CLIENT}eval-ci.ts`);

  it('knowledge.ts: the `// ---- Eval ----` region is byte-identical', () => {
    const server = knowledgeEvalRegion(serverKnowledge);
    const client = knowledgeEvalRegion(clientKnowledge);
    expect(server).toContain('export const EvalCase =');
    expect(server).toContain('export const EvalCaseOutcome =');
    expect(client).toBe(server);
  });

  it('eval-ci.ts: the eval blocks (runs, overview, dashboard, compare) are byte-identical', () => {
    const server = evalCiEvalRegion(serverEvalCi);
    const client = evalCiEvalRegion(clientEvalCi);
    expect(server).toContain('export const EvalRunDetail =');
    expect(server).toContain('export const EvalCompare =');
    expect(client).toBe(server);
  });

  it('no eval symbol lives outside its compared region (a new Eval* export cannot drift unnoticed)', () => {
    for (const [name, whole, region] of [
      ['server knowledge.ts', serverKnowledge, knowledgeEvalRegion(serverKnowledge)],
      ['client knowledge.ts', clientKnowledge, knowledgeEvalRegion(clientKnowledge)],
      ['server eval-ci.ts', serverEvalCi, evalCiEvalRegion(serverEvalCi)],
      ['client eval-ci.ts', clientEvalCi, evalCiEvalRegion(clientEvalCi)],
    ] as const) {
      expect(evalExports(region), name).toEqual(evalExports(whole));
    }
  });

  it('the same set of Eval* symbols is exported by both copies', () => {
    expect(evalExports(clientKnowledge)).toEqual(evalExports(serverKnowledge));
    expect(evalExports(clientEvalCi)).toEqual(evalExports(serverEvalCi));
  });

  it('NFR-9: neither eval region uses `.default()` — that is what keeps the two copies identical', () => {
    for (const region of [
      knowledgeEvalRegion(serverKnowledge),
      evalCiEvalRegion(serverEvalCi),
    ]) {
      // code only — the region's own comments mention `.default()` in prose
      const code = region
        .split('\n')
        .filter((l) => !l.trim().startsWith('//'))
        .join('\n');
      expect(code).not.toMatch(/\.default\(/);
    }
  });
});
