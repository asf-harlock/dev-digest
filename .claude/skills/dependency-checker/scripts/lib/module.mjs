// Collects everything about ONE module (a directory with its own package.json).
// Read-only. Never installs, updates or rewrites anything.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname, sep } from 'node:path';
import { parsePnpmLock, parseNpmLock } from './lock.mjs';
import { makeSizer } from './disk.mjs';
import { analyzeGraph } from './graph.mjs';
import {
  scanTree, aliasMatchersFromPaths, configMentions, binNames, typesTarget,
} from './imports.mjs';

const SECTIONS = {
  dependencies: 'prod',
  devDependencies: 'dev',
  optionalDependencies: 'optional',
  peerDependencies: 'peer',
};

function readJson(file) {
  const text = readFileSync(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch {
    // tsconfig allows comments and trailing commas
    return JSON.parse(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
  }
}

export function readDeclared(pkgJson) {
  const declared = {};
  for (const [section, kind] of Object.entries(SECTIONS)) {
    for (const [name, specifier] of Object.entries(pkgJson[section] ?? {})) {
      declared[name] ??= { specifier, kind };
    }
  }
  return declared;
}

export function detectPm(moduleDir) {
  if (existsSync(join(moduleDir, 'pnpm-lock.yaml'))) return { pm: 'pnpm', lockfile: 'pnpm-lock.yaml' };
  if (existsSync(join(moduleDir, 'package-lock.json'))) return { pm: 'npm', lockfile: 'package-lock.json' };
  for (const f of ['yarn.lock', 'bun.lockb', 'bun.lock']) {
    if (existsSync(join(moduleDir, f))) return { pm: 'unsupported', lockfile: f };
  }
  return { pm: 'none', lockfile: null };
}

export function readTsPaths(moduleDir) {
  const file = join(moduleDir, 'tsconfig.json');
  if (!existsSync(file)) return { paths: {}, baseDir: moduleDir };
  try {
    const c = readJson(file).compilerOptions ?? {};
    return { paths: c.paths ?? {}, baseDir: c.baseUrl ? resolve(moduleDir, c.baseUrl) : moduleDir };
  } catch {
    return { paths: {}, baseDir: moduleDir };
  }
}

// How is each declared dependency used? Booleans, so the rules stay simple.
export function computeUsage(moduleDir, pkgJson, declared, scan) {
  const mentions = configMentions(moduleDir, pkgJson);
  const usage = {};
  for (const name of Object.keys(declared)) {
    const rec = scan.byPackage.get(name);
    const u = {
      src: (rec?.src ?? 0) > 0,
      test: (rec?.test ?? 0) > 0,
      config: (rec?.config ?? 0) > 0 || mentions.quoted(name),
      script: binNames(moduleDir, name).some((b) => mentions.word(b)),
      typesOf: false,
      ref: !!scan.strRefs?.has(name), // named as a string somewhere (plugin, transport, loader)
      linked: false, // needed by a sibling module's source this module compiles
      files: rec?.files ?? { src: [], test: [], config: [] },
    };
    if (name.startsWith('@types/')) {
      const target = typesTarget(name);
      u.typesOf = scan.byPackage.has(target) || mentions.quoted(target);
    }
    u.used = u.src || u.test || u.config || u.script || u.typesOf || u.ref;
    usage[name] = u;
  }
  return usage;
}

export function collectModule(root, dirName) {
  const moduleDir = join(root, dirName);
  const pkgJson = readJson(join(moduleDir, 'package.json'));
  const declared = readDeclared(pkgJson);
  const { pm, lockfile } = detectPm(moduleDir);
  const installed = existsSync(join(moduleDir, 'node_modules'));

  const out = {
    dir: dirName,
    packageName: pkgJson.name ?? dirName,
    pm,
    lockfile,
    installed,
    declaredCounts: {
      prod: Object.keys(pkgJson.dependencies ?? {}).length,
      dev: Object.keys(pkgJson.devDependencies ?? {}).length,
      optional: Object.keys(pkgJson.optionalDependencies ?? {}).length,
      peer: Object.keys(pkgJson.peerDependencies ?? {}).length,
    },
    totals: null,
    directs: [],
    heaviest: [],
    multiVersion: [],
    versionsByName: {},
    imports: { files: 0, phantom: [], crossings: [] },
    aliasEdges: [],
    notes: [],
  };

  if (pm === 'none' || pm === 'unsupported') {
    out.notes.push(
      pm === 'none'
        ? 'No lockfile — the dependency graph and sizes cannot be derived.'
        : `Lockfile ${lockfile} is not supported (only pnpm-lock.yaml v9 and package-lock.json v2/v3).`,
    );
  }
  if (!installed) out.notes.push('node_modules is missing — sizes are n/a. Install with the module\'s own package manager, then re-run.');

  // --- graph + sizes ---
  let graph = null;
  if (pm === 'pnpm') graph = parsePnpmLock(readFileSync(join(moduleDir, lockfile), 'utf8'));
  if (pm === 'npm') graph = parseNpmLock(readJson(join(moduleDir, lockfile)));
  if (graph) {
    const analysis = analyzeGraph(graph, declared, makeSizer(moduleDir, graph));
    Object.assign(out, {
      totals: analysis.totals,
      directs: analysis.directs,
      heaviest: analysis.heaviest,
      multiVersion: analysis.multiVersion,
      versionsByName: analysis.versionsByName,
    });
  }

  // --- imports, usage, phantom dependencies ---
  const { paths } = readTsPaths(moduleDir);
  const aliasMatchers = aliasMatchersFromPaths(paths);
  const scan = scanTree(moduleDir, { aliasMatchers, names: Object.keys(declared), repoRoot: root });
  out.imports.files = scan.files;
  // A relative import into a sibling module bypasses the tsconfig alias and the module's public entry.
  out.imports.crossings = scan.crossings.filter((c) => c.to !== dirName && existsSync(join(root, c.to, 'package.json')));
  const usage = computeUsage(moduleDir, pkgJson, declared, scan);
  for (const d of out.directs) d.usage = usage[d.name] ?? null;
  // declared in package.json but absent from the lock graph (e.g. peers)
  out.declaredOnly = Object.keys(declared)
    .filter((n) => !out.directs.some((d) => d.name === n))
    .map((name) => ({ name, ...declared[name], usage: usage[name] }));

  for (const [name, rec] of scan.byPackage) {
    if (declared[name] || name === pkgJson.name) continue;
    out.imports.phantom.push({ name, src: rec.src, test: rec.test, config: rec.config, files: rec.files });
  }
  out.bundled = 'next' in (pkgJson.dependencies ?? {}); // a built app: build-time libs may sit in devDependencies
  // Nothing in it is ever started, built or imported by name: a test/eval harness, not a shipped package.
  const sc = pkgJson.scripts ?? {};
  out.tooling = !(pkgJson.main || pkgJson.bin || pkgJson.exports || sc.start || sc.dev || sc.build);
  out.imports.phantom.sort((a, b) => b.src - a.src || a.name.localeCompare(b.name));

  // --- source-level links to sibling modules (tsconfig path aliases) ---
  const edges = new Map(); // `${to}` -> edge
  for (const [alias, targets] of Object.entries(paths)) {
    const target = Array.isArray(targets) ? targets[0] : null;
    if (!target) continue;
    const abs = resolve(moduleDir, target.replace(/\/\*$/, ''));
    const rel = relative(root, abs);
    if (rel.startsWith('..') || rel.startsWith(dirName + sep) || rel === dirName) continue;
    const to = rel.split(sep)[0];
    if (!existsSync(join(root, to, 'package.json'))) continue; // a sibling module only
    if (!edges.has(to)) edges.set(to, { from: dirName, to, aliases: [], targetDirs: new Set() });
    const edge = edges.get(to);
    edge.aliases.push(alias);
    const isFile = existsSync(abs) && statSync(abs).isFile();
    edge.targetDirs.add(isFile ? dirname(abs) : abs);
  }
  for (const edge of edges.values()) {
    const externals = new Map();
    for (const dir of edge.targetDirs) {
      const sub = scanTree(dir, { aliasMatchers, classifyBase: join(root, edge.to) });
      for (const [name, rec] of sub.byPackage) {
        if (rec.src === 0) continue; // tests/config of the sibling are never compiled into this module
        const e = externals.get(name) ?? { name, files: [] };
        e.files.push(...rec.files.src.slice(0, 2));
        externals.set(name, e);
      }
    }
    out.aliasEdges.push({
      from: edge.from,
      to: edge.to,
      aliases: edge.aliases,
      targets: [...edge.targetDirs].map((d) => relative(root, d).split(sep).join('/')),
      externals: [...externals.values()].map((e) => ({ name: e.name, files: e.files.slice(0, 2) })),
      // an alias that points into this module's own node_modules pins that package to one copy
      pinned: [...new Set(
        Object.entries(paths)
          .filter(([, t]) => String(Array.isArray(t) ? t[0] : t).includes('node_modules'))
          .map(([k]) => k.replace(/\/\*$/, '')),
      )],
    });
  }
  // A package imported only by the sibling source this module compiles is still
  // required here (e.g. zod for the shared contracts), so it counts as used at runtime.
  for (const edge of out.aliasEdges) {
    for (const ext of edge.externals) {
      const u = usage[ext.name];
      if (!u) continue;
      u.linked = true;
      u.src = true;
      u.used = true;
    }
  }
  return out;
}
