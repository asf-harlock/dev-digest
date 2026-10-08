// Size measurement. Read-only: lstat + readdir, symlinks are never followed.
// "Size" everywhere in this skill = apparent bytes of regular files that sit in
// the package's own directory (nested node_modules excluded — those are
// separate graph nodes). It is installed size on THIS machine, not download
// size and not bundle size.

import { lstatSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export function dirStats(dir) {
  let top;
  try {
    top = lstatSync(dir);
  } catch {
    return null;
  }
  if (!top.isDirectory()) return null;

  let bytes = 0;
  let files = 0;
  const stack = [[dir, true]];
  while (stack.length) {
    const [cur, isTop] = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = join(cur, e.name);
      if (e.isDirectory()) {
        if (isTop && e.name === 'node_modules') continue;
        stack.push([p, false]);
      } else if (e.isFile()) {
        try {
          bytes += lstatSync(p).size;
          files++;
        } catch {
          /* vanished mid-scan */
        }
      }
    }
  }
  return { bytes, files };
}

// pnpm keeps every package in node_modules/.pnpm/<dir>/node_modules/<name>.
// <dir> = `name@version` with `/` -> `+`, then `_<peers>` when peers apply.
export function buildPnpmIndex(moduleDir) {
  const root = join(moduleDir, 'node_modules', '.pnpm');
  if (!existsSync(root)) return null;
  const entries = readdirSync(root);
  return {
    root,
    find(name, version) {
      const base = `${name.replace('/', '+')}@${version}`;
      const hit = entries.find((e) => e === base) ?? entries.find((e) => e.startsWith(`${base}_`));
      return hit ? join(root, hit, 'node_modules', name) : null;
    },
  };
}

// Returns a function node -> {bytes, files} | null, memoised by name@version.
export function makeSizer(moduleDir, graph) {
  const cache = new Map();
  const hasModules = existsSync(join(moduleDir, 'node_modules'));
  const pnpmIndex = graph.pm === 'pnpm' && hasModules ? buildPnpmIndex(moduleDir) : null;

  return function sizeOf(node) {
    if (!hasModules) return null;
    const key = `${node.name}@${node.version}`;
    if (cache.has(key)) return cache.get(key);
    let dir = null;
    if (graph.pm === 'npm') dir = join(moduleDir, node.id);
    else if (pnpmIndex) dir = pnpmIndex.find(node.name, node.version);
    const stats = dir ? dirStats(dir) : null;
    cache.set(key, stats);
    return stats;
  };
}
