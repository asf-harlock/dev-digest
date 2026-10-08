// Import scanner — answers "is this declared package actually used, and where?"
// Heuristic by design: a regex over source text, not a parser. It can over-count
// (an import inside a comment) and under-count (a dynamic specifier), so the
// rules built on it carry confidence `verify` unless the fact is unambiguous.

import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import { join, relative, sep, basename } from 'node:path';
import { builtinModules } from 'node:module';

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.next', 'coverage', 'clones', 'test-results', 'build',
  'out', '.turbo', '.git', 'docs', 'specs', 'messages', '.claude', '.vite',
]);
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const CSS_EXT = /\.css$/;
const MAX_FILE_BYTES = 1024 * 1024;

const SPEC_RES = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g, // import x from 'a' / export * from 'a'
  /\bimport\s*['"]([^'"\n]+)['"]/g, // import 'a'
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g, // import('a')
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g, // require('a')
  /\b(?:vi|jest)\.(?:mock|doMock|importActual|importMock)\s*\(\s*['"]([^'"\n]+)['"]/g,
];
const CSS_RES = [/@(?:import|plugin|config)\s+['"]([^'"\n]+)['"]/g];

const BUILTINS = new Set(builtinModules.flatMap((m) => [m, m.replace(/^node:/, '')]));

export function extractSpecifiers(text, isCss = false) {
  const out = new Set();
  for (const re of isCss ? CSS_RES : SPEC_RES) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(text)); ) out.add(m[1]);
  }
  return [...out];
}

// 'lodash/get' -> 'lodash'; '@a/b/c' -> '@a/b'; relative, absolute, node: and
// builtin specifiers -> null.
export function toPackageName(spec) {
  if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return null;
  if (spec.startsWith('#')) return null; // package.json "imports"
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (!name || (spec.startsWith('@') && parts.length < 2)) return null;
  if (BUILTINS.has(name)) return null;
  return name;
}

export function classifyFile(relPath) {
  const p = relPath.split(sep).join('/');
  if (/(^|\/)(test|tests|__tests__|__mocks__)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/.test(p)) return 'test';
  if (!p.includes('/') && /\.config\.|(^|\/)(setup|vitest\.setup)\./.test(p)) return 'config';
  return 'src';
}

function* walk(dir, root) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      yield* walk(p, root);
    } else if (e.isFile() && (CODE_EXT.test(e.name) || CSS_EXT.test(e.name))) {
      yield p;
    }
  }
}

// Scan a directory tree. `aliasMatchers` are predicates for tsconfig path
// aliases (`@/…`, `@devdigest/shared`) so they are not mistaken for packages.
export function scanTree(dir, { aliasMatchers = [], classifyBase = dir } = {}) {
  const byPackage = new Map(); // name -> {src, test, config, files: [relPath]}
  let files = 0;
  for (const file of walk(dir, dir)) {
    let text;
    try {
      if (lstatSync(file).size > MAX_FILE_BYTES) continue;
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    files++;
    const rel = relative(classifyBase, file);
    const kind = classifyFile(rel);
    for (const spec of extractSpecifiers(text, CSS_EXT.test(file))) {
      if (aliasMatchers.some((m) => m(spec))) continue;
      const name = toPackageName(spec);
      if (!name) continue;
      if (!byPackage.has(name)) byPackage.set(name, { src: 0, test: 0, config: 0, files: [] });
      const rec = byPackage.get(name);
      rec[kind]++;
      if (rec.files.length < 3) rec.files.push(rel.split(sep).join('/'));
    }
  }
  return { files, byPackage };
}

// Turn tsconfig `paths` keys into predicates. `@/*` -> startsWith('@/');
// `@devdigest/shared` -> exact; `@devdigest/shared/*` -> prefix.
export function aliasMatchersFromPaths(paths = {}) {
  return Object.keys(paths).map((k) =>
    k.endsWith('/*') ? (s) => s.startsWith(k.slice(0, -1)) : (s) => s === k,
  );
}

// Names that appear as a quoted string in root-level config files, tsconfig or
// package.json scripts — tools wired up by configuration, never imported.
export function configMentions(moduleDir, pkgJson) {
  const texts = [JSON.stringify(pkgJson.scripts ?? {})];
  for (const name of safeReaddir(moduleDir)) {
    if (!/(\.config\.[cm]?[jt]s|^tsconfig[^/]*\.json|^\.eslintrc[^/]*)$/.test(name)) continue;
    try {
      texts.push(readFileSync(join(moduleDir, name), 'utf8'));
    } catch {
      /* unreadable config — ignore */
    }
  }
  const blob = texts.join('\n');
  return {
    quoted: (name) => new RegExp(`['"\`]${escapeRe(name)}(?:/[^'"\`]*)?['"\`]`).test(blob),
    word: (w) => new RegExp(`(^|[^\\w@/.-])${escapeRe(w)}($|[^\\w/.-])`).test(blob),
    blob,
  };
}

// Executable names an installed package exposes (`bin`), for matching against scripts.
export function binNames(moduleDir, name) {
  const file = join(moduleDir, 'node_modules', name, 'package.json');
  if (!existsSync(file)) return [];
  try {
    const { bin } = JSON.parse(readFileSync(file, 'utf8'));
    if (!bin) return [];
    return typeof bin === 'string' ? [basename(name)] : Object.keys(bin);
  } catch {
    return [];
  }
}

// `@types/node` -> 'node'; `@types/scope__pkg` -> '@scope/pkg'.
export function typesTarget(typesName) {
  const rest = typesName.slice('@types/'.length);
  return rest.includes('__') ? `@${rest.replace('__', '/')}` : rest;
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
