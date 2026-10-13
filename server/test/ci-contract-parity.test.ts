import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * NFR-4 — the Export-to-CI contracts (SPEC-11) exist in TWO physical copies of
 * `@devdigest/shared` (`server/src/vendor/shared` and `client/src/vendor/shared`)
 * and must change in the same commit. They differ in exactly one allowed way:
 * a field with `.default(...)` on the server is `.optional()` in the client copy.
 *
 * Compared region: the `Export-to-CI + CI Runs` section of `eval-ci.ts`, up to the
 * next section banner. Known, deliberate drift inside it:
 *   - `AgentManifest` (+ its input type) is server-only — the studio WRITES it, the
 *     runner READS it; the browser never parses it.
 * Everything else must be identical once server `.default(...)` is read as
 * `.optional()`. Drift outside the region (Conformance's provider enum, …) is
 * pre-existing and not this spec's business.
 */

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

const SERVER = read('../src/vendor/shared/contracts/eval-ci.ts');
const CLIENT = read('../../client/src/vendor/shared/contracts/eval-ci.ts');

const START = 'Export-to-CI + CI Runs';
/** The SPEC-11 contracts start here; the lines above it (`CiTarget`, `CiFile`) predate the spec. */
const SPEC_START = 'export const CiExportInput = ';
const END = 'Conformance (PRD';

function bannerStart(src: string, marker: string): number {
  const at = src.indexOf(marker);
  if (at === -1) throw new Error(`marker not found: ${marker}`);
  return src.lastIndexOf('// ====', at);
}

function region(src: string): string {
  const start = bannerStart(src, START);
  const end = bannerStart(src, END);
  if (end <= start) throw new Error('region markers are out of order');
  return src.slice(start, end);
}

/** Drop the server-only `AgentManifest` block (its doc comment through `AgentManifestInput`). */
function withoutAgentManifest(src: string): string {
  const start = src.indexOf('/**\n * AgentManifest');
  const endMarker = 'export type AgentManifestInput = z.input<typeof AgentManifest>;\n';
  const end = src.indexOf(endMarker);
  if (start === -1 || end === -1) return src;
  return src.slice(0, start) + src.slice(end + endMarker.length);
}

/** Code only: comment lines and trailing `// …` comments removed, blank lines dropped. */
function code(src: string): string {
  return src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
    .map((l) => l.replace(/\s+\/\/.*$/, '').trimEnd())
    .filter((l) => l.trim() !== '')
    .join('\n');
}

/** Replace every `.default(<balanced args>)` with `.optional()`. */
function defaultsToOptional(src: string): string {
  let out = '';
  let i = 0;
  const needle = '.default(';
  for (;;) {
    const at = src.indexOf(needle, i);
    if (at === -1) return out + src.slice(i);
    out += src.slice(i, at) + '.optional()';
    let depth = 1;
    let j = at + needle.length;
    while (j < src.length && depth > 0) {
      if (src[j] === '(') depth += 1;
      else if (src[j] === ')') depth -= 1;
      j += 1;
    }
    i = j;
  }
}

const exportsOf = (src: string): string[] =>
  [...new Set([...src.matchAll(/^export (?:const|type) (\w+)/gm)].map((m) => m[1]!))].sort();

/** `[prelude, spec]` — split at the first SPEC-11 contract. */
function split(src: string): [string, string] {
  const at = src.indexOf(SPEC_START);
  if (at === -1) throw new Error(`marker not found: ${SPEC_START}`);
  return [src.slice(0, at), src.slice(at)];
}

describe('NFR-4: Export-to-CI contract parity between the server and client vendor copies', () => {
  const [serverPrelude, serverSpec] = split(withoutAgentManifest(region(SERVER)));
  const [clientPrelude, clientSpec] = split(region(CLIENT));
  const serverRegion = serverPrelude + serverSpec;
  const clientRegion = clientPrelude + clientSpec;

  it('NFR-4: the pre-existing CiTarget / CiFile block is byte-identical in both copies', () => {
    expect(code(clientPrelude)).toBe(code(serverPrelude));
  });

  it('NFR-4: both copies carry the SPEC-11 contracts', () => {
    for (const name of [
      'CiExportInput',
      'CiInstallation',
      'CiRun',
      'CiPreview',
      'CiRefreshInput',
      'CiRefreshResult',
      'CiRunMeta',
      'CiErrorCode',
    ]) {
      expect(exportsOf(serverRegion), `server ${name}`).toContain(name);
      expect(exportsOf(clientRegion), `client ${name}`).toContain(name);
    }
  });

  it('NFR-4: the same symbols are exported by both copies (AgentManifest is the one server-only block)', () => {
    expect(exportsOf(clientRegion)).toEqual(exportsOf(serverRegion));
    expect(exportsOf(region(SERVER)).filter((n) => !exportsOf(clientRegion).includes(n)).sort()).toEqual([
      'AgentManifest',
      'AgentManifestInput',
    ]);
  });

  it('NFR-4: identical except that server `.default(...)` is `.optional()` in the client', () => {
    expect(code(clientSpec)).toBe(defaultsToOptional(code(serverSpec)));
  });

  it('NFR-4: the client copy has no `.default(` in the SPEC-11 contracts (a default there would change parsed output)', () => {
    expect(code(clientSpec)).not.toMatch(/\.default\(/);
  });

  it('NFR-4: the server copy still uses `.default(` for the input defaults the client mirrors as optional', () => {
    const serverCode = code(serverSpec);
    for (const field of ['target', 'action', 'post_as', 'triggers', 'force', 'limit']) {
      expect(serverCode, field).toMatch(new RegExp(`${field}:[^\\n]*\\.default\\(`));
    }
  });
});
