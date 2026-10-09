// Run: node --test .claude/skills/dependency-checker/scripts/collect.test.mjs
// (pass the FILE — `node --test <dir>` does not discover tests on Node 26).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYamlSubset } from './lib/yaml.mjs';
import { parsePnpmLock, parseNpmLock, splitPnpmKey } from './lib/lock.mjs';
import { analyzeGraph } from './lib/graph.mjs';
import { extractSpecifiers, toPackageName, classifyFile, aliasMatchersFromPaths, scanTree } from './lib/imports.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFindings, scoreOf } from './lib/rules.mjs';
import { fmtBytes, mmLabel, MB } from './lib/format.mjs';
import { judgementBlock, PENDING } from './lib/render.mjs';
import { checkReport } from './check-report.mjs';
import { parseNpmAudit, parsePnpmAudit, advisoryFindings, outdatedFindings } from './lib/online.mjs';

// ---- yaml ------------------------------------------------------------------

test('yaml: nested maps, quoted keys, lists; every scalar stays a string', () => {
  const doc = parseYamlSubset(`
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      '@scope/pkg':
        specifier: ^1.0
        version: 1.0.3(peer@2.0.0)
snapshots:
  foo@1.2.3:
    dependencies:
      bar: 2.0.0
    transitivePeerDependencies:
      - supports-color
    optional: true
`);
  assert.equal(doc.lockfileVersion, '9.0');
  assert.equal(doc.importers['.'].dependencies['@scope/pkg'].specifier, '^1.0');
  assert.equal(doc.importers['.'].dependencies['@scope/pkg'].version, '1.0.3(peer@2.0.0)');
  assert.deepEqual(doc.snapshots['foo@1.2.3'].transitivePeerDependencies, ['supports-color']);
  assert.equal(doc.snapshots['foo@1.2.3'].optional, 'true');
});

// ---- lockfiles -------------------------------------------------------------

test('pnpm: splits keys with peer suffix and scoped names', () => {
  assert.deepEqual(splitPnpmKey('@a/b@1.0.0(c@2.0.0)(d@3.0.0)'), { name: '@a/b', version: '1.0.0' });
  assert.deepEqual(splitPnpmKey('foo@1.2.3'), { name: 'foo', version: '1.2.3' });
});

const PNPM = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      a:
        specifier: ^1.0.0
        version: 1.0.0
    devDependencies:
      b:
        specifier: ^1.0.0
        version: 1.0.0(c@1.0.0)
snapshots:
  a@1.0.0:
    dependencies:
      c: 1.0.0
  b@1.0.0(c@1.0.0):
    dependencies:
      c: 1.0.0
  c@1.0.0: {}
`;

test('pnpm: resolves direct deps and edges by snapshot key', () => {
  const g = parsePnpmLock(PNPM);
  assert.equal(g.pm, 'pnpm');
  assert.equal(g.direct.dependencies.a, 'a@1.0.0');
  assert.equal(g.direct.devDependencies.b, 'b@1.0.0(c@1.0.0)');
  assert.deepEqual(g.nodes.get('a@1.0.0').deps, ['c@1.0.0']);
});

test('npm: resolves a dependency the way node_modules nesting does', () => {
  const g = parseNpmLock({
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { a: '^1' }, devDependencies: { c: '^2' } },
      'node_modules/a': { version: '1.0.0', dependencies: { c: '^1' } },
      'node_modules/a/node_modules/c': { version: '1.0.0' },
      'node_modules/c': { version: '2.0.0', dev: true },
    },
  });
  assert.equal(g.direct.devDependencies.c, 'node_modules/c');
  // a needs c: the nested copy wins over the hoisted one
  assert.deepEqual(g.nodes.get('node_modules/a').deps, ['node_modules/a/node_modules/c']);
});

// ---- graph: exclusive size and declared-dependency boundaries ------------------

test('graph: exclusive counts only what no other direct dependency pulls in; declared deps are boundaries', () => {
  // a -> shared, only_a, b(declared peer) ; b -> shared ; b has its own file
  const g = {
    pm: 'pnpm',
    nodes: new Map([
      ['a@1', { id: 'a@1', name: 'a', version: '1', deps: ['shared@1', 'only_a@1', 'b@1'] }],
      ['b@1', { id: 'b@1', name: 'b', version: '1', deps: ['shared@1'] }],
      ['shared@1', { id: 'shared@1', name: 'shared', version: '1', deps: [] }],
      ['only_a@1', { id: 'only_a@1', name: 'only_a', version: '1', deps: [] }],
    ]),
    direct: { dependencies: { a: 'a@1', b: 'b@1' }, devDependencies: {}, optionalDependencies: {} },
  };
  const sizes = { a: 10, b: 100, shared: 1000, only_a: 10000 };
  const out = analyzeGraph(g, { a: { specifier: '^1' }, b: { specifier: '^1' } }, (n) => ({ bytes: sizes[n.name], files: 1 }));
  const a = out.directs.find((d) => d.name === 'a');
  const b = out.directs.find((d) => d.name === 'b');
  assert.equal(a.ownBytes, 10);
  assert.equal(a.exclusiveBytes, 10 + 10000); // shared is also pulled by b; b is a boundary, not a's
  assert.equal(a.reachBytes, 10 + 1000 + 10000);
  assert.equal(b.exclusiveBytes, 100); // shared is covered by a as well
  assert.deepEqual(a.pulledByOthers, []);
  assert.deepEqual(b.pulledByOthers, ['a']);
  assert.equal(out.totals.installedBytes, 11110);
});

test('graph: one name at two versions is reported with the duplicate cost', () => {
  const g = {
    pm: 'npm',
    nodes: new Map([
      ['node_modules/x', { id: 'node_modules/x', name: 'x', version: '1.0.0', deps: [] }],
      ['node_modules/p/node_modules/x', { id: 'node_modules/p/node_modules/x', name: 'x', version: '2.0.0', deps: [] }],
      ['node_modules/p', { id: 'node_modules/p', name: 'p', version: '1.0.0', deps: ['node_modules/p/node_modules/x'] }],
    ]),
    direct: { dependencies: { x: 'node_modules/x', p: 'node_modules/p' }, devDependencies: {}, optionalDependencies: {} },
  };
  const out = analyzeGraph(g, {}, (n) => ({ bytes: n.version === '1.0.0' ? 300 : 500, files: 1 }));
  assert.equal(out.multiVersion.length, 1);
  assert.equal(out.multiVersion[0].extraBytes, 300); // everything but the biggest copy
});

// ---- import scanner --------------------------------------------------------------

test('imports: finds real specifiers, ignores SQL, prose and code-in-template-strings', () => {
  const src = [
    "import { a } from 'pkg-a';",
    'import type {',
    '  B,',
    "} from '@scope/pkg-b/sub';",
    "import 'side-effect-pkg';",
    "export * from 'pkg-c';",
    "const d = await import(/* @vite-ignore */ 'pkg-d' as string);",
    "const e = require('pkg-e');",
    "vi.mock('pkg-f', () => ({}));",
    "const q = 'select * from \"users\"';",
    "const msg = 'imported from \"nowhere\"';",
    'const fixture = `',
    "import { z } from 'only-in-template';",
    '`;',
  ].join('\n');
  const found = extractSpecifiers(src).sort();
  assert.deepEqual(found, ['@scope/pkg-b/sub', 'pkg-a', 'pkg-c', 'pkg-d', 'pkg-e', 'pkg-f', 'side-effect-pkg']);
});

test('imports: package names are validated and normalised', () => {
  assert.equal(toPackageName('lodash/get'), 'lodash');
  assert.equal(toPackageName('@scope/pkg/deep/file'), '@scope/pkg');
  for (const bad of ['./x', '../x', '/abs', 'node:fs', 'fs', 'path', ', ', 'Accept all', '${url}', '#internal']) {
    assert.equal(toPackageName(bad), null, bad);
  }
});

test('imports: a tsconfig pin into node_modules is a real package, not an alias', () => {
  const matchers = aliasMatchersFromPaths({
    '@devdigest/shared': ['../server/src/vendor/shared/index.ts'],
    '@/*': ['./src/*'],
    zod: ['./node_modules/zod'],
  });
  const isAlias = (s) => matchers.some((m) => m(s));
  assert.ok(isAlias('@devdigest/shared'));
  assert.ok(isAlias('@/lib/x'));
  assert.ok(!isAlias('zod'));
});

test('imports: css is build-time config; tests are recognised', () => {
  assert.equal(classifyFile('src/app/globals.css'), 'config');
  assert.equal(classifyFile('src/a/b.test.ts'), 'test');
  assert.equal(classifyFile('test/helpers/pg.ts'), 'test');
  assert.equal(classifyFile('vitest.config.ts'), 'config');
  assert.equal(classifyFile('src/a/b.ts'), 'src');
});

// ---- rules -------------------------------------------------------------------------

function mod(over = {}) {
  return {
    dir: 'srv', pm: 'pnpm', installed: true, bundled: false, tooling: false, directs: [], declaredOnly: [], multiVersion: [],
    versionsByName: {}, aliasEdges: [], imports: { files: 10, phantom: [], crossings: [] }, ...over,
  };
}
const direct = (over) => ({
  name: 'x', kind: 'prod', version: '1.0.0', specifier: '^1', ownBytes: 0, exclusiveBytes: 0, reachBytes: 0,
  transitiveCount: 0, pulledByOthers: [], usage: { used: true, src: true, test: false, config: false, script: false, typesOf: false, files: { src: ['a.ts'], test: [], config: [] } },
  ...over,
});
const rules = (fs) => fs.map((f) => `${f.rule}:${f.package}:${f.severity}`);

test('rules: unused, phantom, placement and bundled-app downgrade', () => {
  const m = mod({
    directs: [
      direct({ name: 'dead', usage: { used: false, src: false, test: false, config: false, script: false, typesOf: false, files: { src: [], test: [], config: [] } } }),
      direct({ name: 'viaPeer', pulledByOthers: ['host'], usage: { used: false, src: false, test: false, config: false, script: false, typesOf: false, files: { src: [], test: [], config: [] } } }),
      direct({ name: 'dev-in-src', kind: 'dev' }),
      direct({ name: 'prod-test-only', usage: { used: true, src: false, test: true, config: false, script: false, typesOf: false, files: { src: [], test: ['t.test.ts'], config: [] } } }),
    ],
    imports: { files: 10, crossings: [], phantom: [{ name: 'ghost', src: 1, test: 0, config: 0, files: { src: ['g.ts'], test: [], config: [] } }] },
  });
  const got = rules(buildFindings([m]));
  assert.ok(got.includes('UNUSED:dead:low'));
  assert.ok(got.includes('UNUSED:viaPeer:info'), 'a redundant peer declaration is info, not low');
  assert.ok(got.includes('PLACEMENT:dev-in-src:high'));
  assert.ok(got.includes('PLACEMENT:prod-test-only:low'));
  assert.ok(got.includes('PHANTOM:ghost:high'));

  const bundled = rules(buildFindings([{ ...m, bundled: true }]));
  assert.ok(bundled.includes('PLACEMENT:dev-in-src:low'), 'build-time libs in a bundled app are not high');
  const tooling = rules(buildFindings([{ ...m, tooling: true }]));
  assert.ok(tooling.includes('PLACEMENT:dev-in-src:low'), 'a tooling-only package is never installed with --prod');
});

test('rules: a relative import into a sibling module is high from src and medium from tests', () => {
  const crossing = (kind) => ({ file: 'a.ts', spec: '../../server/src/x.js', to: 'server', kind });
  const sev = (kind) => buildFindings([mod({ imports: { files: 1, phantom: [], crossings: [crossing(kind)] } })]).find((f) => f.rule === 'BOUNDARY_BYPASS')?.severity;
  assert.equal(sev('src'), 'high');
  assert.equal(sev('test'), 'medium');
});

test('imports: a relative import that leaves the module is recorded; one that stays inside is not', () => {
  const root = mkdtempSync(join(tmpdir(), 'depchk-'));
  try {
    mkdirSync(join(root, 'a', 'src'), { recursive: true });
    mkdirSync(join(root, 'b', 'src'), { recursive: true });
    writeFileSync(join(root, 'a', 'package.json'), '{}');
    writeFileSync(join(root, 'b', 'package.json'), '{}');
    writeFileSync(join(root, 'b', 'src', 'x.ts'), 'export const x = 1;');
    writeFileSync(join(root, 'a', 'src', 'local.ts'), 'export const l = 1;');
    writeFileSync(join(root, 'a', 'src', 'main.ts'), "import { x } from '../../b/src/x.js';\nimport { l } from './local.js';\nimport z from 'zod';\n");
    writeFileSync(join(root, 'a', 'src', 'main.test.ts'), "import { x } from '../../b/src/x.js';\n");
    const scan = scanTree(join(root, 'a'), { repoRoot: root });
    assert.deepEqual(scan.crossings.map((c) => `${c.file}|${c.to}|${c.kind}`).sort(), ['src/main.test.ts|b|test', 'src/main.ts|b|src']);
    assert.ok(scan.byPackage.has('zod'), 'bare imports are still scanned');
    assert.ok(!scan.byPackage.has('b'), 'a relative path is never a package');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rules: cross-module drift is medium only when the major differs', () => {
  const a = mod({ dir: 'a', directs: [direct({ name: 'zod', version: '3.25.0' }), direct({ name: 'ms', version: '2.1.0' })] });
  const b = mod({ dir: 'b', directs: [direct({ name: 'zod', version: '4.0.0' }), direct({ name: 'ms', version: '2.1.3' })] });
  const got = rules(buildFindings([a, b]).filter((f) => f.rule === 'CROSS_MODULE_DRIFT'));
  assert.ok(got.includes('CROSS_MODULE_DRIFT:zod:medium'));
  assert.ok(got.includes('CROSS_MODULE_DRIFT:ms:low'));
});

test('rules: platform-binary duplicates fold into their tool; dev-only duplicates cap at low', () => {
  const mv = (name, extra, runtime) => ({
    name, extraBytes: extra, onRuntimePath: runtime,
    versions: [{ version: '1', bytes: 1, pulledBy: ['x'] }, { version: '2', bytes: 1, pulledBy: ['y'] }],
  });
  const m = mod({ multiVersion: [mv('esbuild', 10 * MB, false), mv('@esbuild/darwin-arm64', 10 * MB, false), mv('rt', 10 * MB, true)] });
  const fs = buildFindings([m]).filter((f) => f.rule === 'MULTI_VERSION');
  assert.equal(fs.length, 2, '@esbuild/* is folded into esbuild');
  const esb = fs.find((f) => f.package === 'esbuild');
  assert.equal(esb.bytes, 20 * MB);
  assert.equal(esb.severity, 'low');
  assert.equal(fs.find((f) => f.package === 'rt').severity, 'medium');
});

test('rules: dual instance — version mismatch is high, pinned is info, unpinned identity-sensitive is medium', () => {
  const owner = (v) => mod({ dir: 'core', versionsByName: { zod: [v], openai: ['4.0.0'] }, directs: [direct({ name: 'zod', ownBytes: 5 })] });
  const consumer = (v, pinned) => mod({
    dir: 'srv', versionsByName: { zod: [v], openai: ['4.0.0'] },
    directs: [direct({ name: 'zod' }), direct({ name: 'openai' })],
    aliasEdges: [{ from: 'srv', to: 'core', aliases: ['@x/core'], externals: [{ name: 'zod', files: ['a.ts'] }, { name: 'openai', files: ['b.ts'] }], pinned }],
  });
  const sev = (fs, pkg) => fs.find((f) => f.rule === 'DUAL_INSTANCE' && f.package === pkg)?.severity;
  assert.equal(sev(buildFindings([consumer('4.0.0', []), owner('3.0.0')]), 'zod'), 'high');
  assert.equal(sev(buildFindings([consumer('3.0.0', ['zod']), owner('3.0.0')]), 'zod'), 'info');
  assert.equal(sev(buildFindings([consumer('3.0.0', []), owner('3.0.0')]), 'zod'), 'medium');
  assert.equal(sev(buildFindings([consumer('3.0.0', []), owner('3.0.0')]), 'openai'), 'low');
});

test('rules: findings are ranked by score and get stable sequential ids', () => {
  const m = mod({ imports: { files: 1, crossings: [], phantom: [{ name: 'g', src: 1, test: 0, config: 0, files: { src: ['g.ts'], test: [], config: [] } }] }, directs: [direct({ name: 'big', exclusiveBytes: 40 * MB, ownBytes: 40 * MB, reachBytes: 40 * MB })] });
  const fs = buildFindings([m]);
  assert.deepEqual(fs.map((f) => f.id), fs.map((_, i) => `F-${String(i + 1).padStart(2, '0')}`));
  assert.ok(fs[0].score >= fs[fs.length - 1].score);
  // severity dominates size: a bare high outranks a huge medium on the runtime path
  assert.ok(scoreOf({ severity: 'high', bytes: 0, prod: false }) > scoreOf({ severity: 'medium', bytes: 100 * MB, prod: true }));
});

// ---- formatting ----------------------------------------------------------------------

test('format: sizes and mermaid labels', () => {
  assert.equal(fmtBytes(null), 'n/a');
  assert.equal(fmtBytes(512), '512 B');
  assert.equal(fmtBytes(1.5 * MB), '1.50 MB');
  assert.equal(fmtBytes(113.4 * MB), '113 MB');
  assert.equal(mmLabel('a"b', '<x>'), "a'b<br/>&lt;x&gt;");
});

// ---- report check ---------------------------------------------------------------------

const metrics = { findings: [{ id: 'F-01', severity: 'high', rule: 'PHANTOM' }, { id: 'F-02', severity: 'low', rule: 'UNUSED' }] };
const GOOD_PRI = '#### P0\n- F-01 declare it\n#### P1\nnone\n#### P2\nnone\n#### Info\nnone';
const GOOD_SUM = 'Healthy. Heap is 113 MB.\n\n1. Declare ghost (F-01).\n2. Remove dead (F-02).\n3. Re-run before release.';
const report = (summary, priorities, advice, { tail = '' } = {}) => [
  '# Dependency report',
  '## Scope', 'x', '## Dependency graph', 'x', '## Size breakdown', '| Heap | 113 MB |',
  '## Findings & Priorities', '### Priorities',
  `<!-- judgement:priorities -->\n${priorities}\n<!-- /judgement:priorities -->`,
  '### Advice', `<!-- judgement:advice -->\n${advice}\n<!-- /judgement:advice -->`,
  '## Summary',
  `<!-- judgement:summary -->\n${summary}\n<!-- /judgement:summary -->`,
  tail,
].join('\n');
const msgs = (r) => checkReport(r, metrics).map((e) => e.msg).join('\n');

test('check-report: accepts a filled, traceable report', () => {
  assert.deepEqual(checkReport(report(GOOD_SUM, GOOD_PRI, 'Do X.'), metrics), []);
});

test('check-report: rejects pending blocks, unknown ids, unaddressed high findings, invented figures', () => {
  assert.match(msgs(report(PENDING, GOOD_PRI, 'Do X.')), /"summary" is still empty/);
  assert.match(msgs(report(GOOD_SUM, GOOD_PRI.replace('F-01', 'F-09'), 'x')), /F-09, which is not in metrics\.json/);
  assert.match(msgs(report(GOOD_SUM, '#### P0\nnothing\n#### P1\nn\n#### P2\nn\n#### Info\nn', 'x')), /F-01 \(high, PHANTOM\) is not addressed/);
  assert.match(msgs(report(GOOD_SUM.replace('113 MB', '999 MB'), GOOD_PRI, 'x')), /999 MB, which appears nowhere/);
});

test('check-report: the priorities block needs all four tiers; the summary needs 3-5 numbered takeaways', () => {
  assert.match(msgs(report(GOOD_SUM, '- F-01 only', 'x')), /no "#### P0" heading/);
  assert.match(msgs(report(GOOD_SUM, GOOD_PRI.replace('#### Info\nnone', ''), 'x')), /no "#### Info" heading/);
  assert.match(msgs(report('Healthy.\n\n1. one\n2. two', GOOD_PRI, 'x')), /3-5 numbered takeaways, found 2/);
  assert.match(msgs(report('Healthy.\n\n1. a\n2. b\n3. c\n4. d\n5. e\n6. f', GOOD_PRI, 'x')), /found 6/);
});

test('check-report: the five sections must exist, in order, and Summary must be last', () => {
  const good = report(GOOD_SUM, GOOD_PRI, 'x');
  assert.match(msgs(good.replace('## Scope', '## Intro')), /missing section "## Scope"/);
  assert.match(msgs(good + '\n## Appendix\nmore'), /must END with the "## Summary"/);
  assert.match(msgs(good.replace('## Scope', '## Size breakdown').replace('## Size breakdown\n| Heap', '## Scope\n| Heap')), /out of order/);
});

test('render: the placeholder block round-trips through the checker markers', () => {
  const block = judgementBlock('summary');
  assert.match(block, /<!-- judgement:summary -->\n.*Pending.*\n<!-- \/judgement:summary -->/);
});

// ---- online parsers (fixtures follow the documented `npm audit` / `pnpm audit` / `outdated` JSON shapes) ----

test('online: npm audit and pnpm audit shapes map to VULN findings; severities are normalised', () => {
  const npm = parseNpmAudit({
    vulnerabilities: {
      minimist: { severity: 'critical', range: '<1.2.6', fixAvailable: { name: 'minimist', version: '1.2.8' }, via: [{ title: 'Prototype Pollution' }] },
      lodash: { severity: 'moderate', range: '<4.17.21', fixAvailable: true, via: ['minimist'] },
    },
  });
  assert.deepEqual(npm.map((a) => [a.name, a.severity]), [['minimist', 'high'], ['lodash', 'medium']]);
  const pnpm = parsePnpmAudit({ advisories: { 1: { module_name: 'semver', severity: 'high', title: 'ReDoS', vulnerable_versions: '<7.5.2', patched_versions: '>=7.5.2' } }, metadata: {} });
  assert.equal(pnpm[0].name, 'semver');
  assert.throws(() => parsePnpmAudit({ nope: 1 }), /unrecognised JSON shape/);
  const m = { dir: 'srv', directs: [{ name: 'minimist', kind: 'prod' }] };
  const fs = advisoryFindings(m, npm);
  assert.equal(fs[0].prod, true);
  assert.match(fs[1].evidence, /Transitive/);
});

test('online: outdated reports majors and deprecations for direct dependencies only', () => {
  const m = { dir: 'srv', directs: [{ name: 'a', kind: 'prod' }, { name: 'b', kind: 'dev' }, { name: 'c', kind: 'prod' }] };
  const fs = outdatedFindings(m, {
    a: { current: '1.2.0', wanted: '1.9.0', latest: '3.0.0' },
    b: { current: '1.0.0', wanted: '1.0.0', latest: '1.4.0' }, // minor only: not reported
    c: { current: '1.0.0', wanted: '1.0.0', latest: '1.0.0', isDeprecated: true },
    transitive: { current: '1.0.0', wanted: '1.0.0', latest: '9.0.0' }, // not declared: skipped
  });
  assert.deepEqual(fs.map((f) => `${f.rule}:${f.package}`), ['OUTDATED:a', 'DEPRECATED:c']);
  assert.match(fs[0].title, /2 major version/);
});
