// Import scanner — answers "is this declared package actually used, and where?"
// Heuristic by design: a regex over source text, not a parser. It can over-count
// (an import inside a comment) and under-count (a dynamic specifier), so the
// rules built on it carry confidence `verify` unless the fact is unambiguous.

import { readdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import { join, relative, sep, basename, resolve, dirname } from 'node:path';
import { builtinModules } from 'node:module';

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.next', 'coverage', 'clones', 'test-results', 'build',
  'out', '.turbo', '.git', 'docs', 'specs', 'messages', '.claude', '.vite',
]);
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const CSS_EXT = /\.css$/;
const MAX_FILE_BYTES = 1024 * 1024;

// Anchored to the start of a statement so that SQL, prose and code-in-strings
// that merely contain the word "from" are not read as imports.
const SPEC_RES = [
  // import x from 'a' · import type { y } from 'a' · export * from 'a' (may span lines)
  /(?:^|[;\n])[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"\n]+)['"]/g,
  /(?:^|[;\n])[ \t]*import\s*['"]([^'"\n]+)['"]/g, // import 'a'
  /\bimport\s*\(\s*(?:\/\*[^*]*\*\/\s*)?['"]([^'"\n]+)['"]/g, // import('a') · import(/* @vite-ignore */ 'a' as string)
  /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g, // require('a')
  /\b(?:vi|jest)\.(?:mock|doMock|importActual|importMock)\s*\(\s*['"]([^'"\n]+)['"]/g,
];
const CSS_RES = [/@(?:import|plugin|config)\s+['"]([^'"\n]+)['"]/g];
const NPM_NAME = /^(?:@[a-z0-9~-][a-z0-9._~-]*\/)?[a-z0-9~-][a-z0-9._~-]*$/;

const BUILTINS = new Set(builtinModules.flatMap((m) => [m, m.replace(/^node:/, '')]));

export function extractSpecifiers(text, isCss = false) {
  const out = new Set();
  // Positions of backticks: a match after an odd number of them sits inside a
  // template literal (code-as-string in a test fixture), not in real code.
  const ticks = [];
  if (!isCss) for (let i = text.indexOf('`'); i >= 0; i = text.indexOf('`', i + 1)) if (text[i - 1] !== '\\') ticks.push(i);
  const insideTemplate = (idx) => {
    let lo = 0;
    let hi = ticks.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ticks[mid] < idx) lo = mid + 1;
      else hi = mid;
    }
    return lo % 2 === 1;
  };
  for (const re of isCss ? CSS_RES : SPEC_RES) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(text)); ) {
      if (!isCss && insideTemplate(m.index)) continue;
      out.add(m[1]);
    }
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
  if (!NPM_NAME.test(name) || BUILTINS.has(name)) return null;
  return name;
}

export function classifyFile(relPath) {
  const p = relPath.split(sep).join('/');
  if (CSS_EXT.test(p)) return 'config'; // @import/@plugin are resolved at build time
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
export function scanTree(dir, { aliasMatchers = [], classifyBase = dir, names = [], repoRoot = null } = {}) {
  const crossings = []; // relative imports that leave `dir` for a sibling top-level directory of repoRoot
  const strRefs = new Map(); // declared name -> {src, test, config}: quoted anywhere, e.g. `target: 'pino-pretty'`
  const byPackage = new Map(); // name -> {src, test, config, files: {src[], test[], config[]}}
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
    for (const name of names) {
      if (!text.includes(name)) continue;
      if (text.includes(`'${name}'`) || text.includes(`"${name}"`)) {
        if (!strRefs.has(name)) strRefs.set(name, { src: 0, test: 0, config: 0 });
        strRefs.get(name)[kind]++;
      }
    }
    for (const spec of extractSpecifiers(text, CSS_EXT.test(file))) {
      if (repoRoot && spec.startsWith('.')) {
        const abs = resolve(dirname(file), spec);
        if (abs !== dir && !abs.startsWith(dir + sep)) {
          const fromRepo = relative(repoRoot, abs);
          if (!fromRepo.startsWith('..')) crossings.push({ file: rel.split(sep).join('/'), spec, to: fromRepo.split(sep)[0], kind });
        }
        continue;
      }
      if (aliasMatchers.some((m) => m(spec))) continue;
      const name = toPackageName(spec);
      if (!name) continue;
      if (!byPackage.has(name)) byPackage.set(name, { src: 0, test: 0, config: 0, files: { src: [], test: [], config: [] } });
      const rec = byPackage.get(name);
      rec[kind]++;
      if (rec.files[kind].length < 3) rec.files[kind].push(rel.split(sep).join('/'));
    }
  }
  return { files, byPackage, strRefs, crossings };
}

// Turn tsconfig `paths` keys into predicates. `@/*` -> startsWith('@/');
// `@devdigest/shared` -> exact; `@devdigest/shared/*` -> prefix.
export function aliasMatchersFromPaths(paths = {}) {
  // `zod -> ./node_modules/zod` pins a REAL package to one copy; it is not an internal alias.
  const internal = Object.keys(paths).filter((k) => !String([].concat(paths[k])[0]).includes('node_modules'));
  return internal.map((k) =>
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
