// Lockfile readers. Both return the same normalised graph:
//   { pm, nodes: Map<id, {id, name, version, deps: id[], optional}>,
//     direct: { dependencies, devDependencies, optionalDependencies }  // name -> id
//   }
// `id` is the lockfile's own key (pnpm snapshot key / npm `node_modules/...` path),
// so two peer-variants of one version stay distinct nodes; sizes are later
// de-duplicated by `name@version`.

import { parseYamlSubset } from './yaml.mjs';

// `foo@1.2.3(bar@2.0.0)` -> { name: 'foo', version: '1.2.3' }; scoped names keep their `@`.
export function splitPnpmKey(key) {
  const base = key.replace(/\(.*$/, '');
  const at = base.lastIndexOf('@');
  if (at <= 0) return { name: base, version: '' };
  return { name: base.slice(0, at), version: base.slice(at + 1) };
}

function pnpmRefToId(name, ref) {
  if (!ref) return null;
  if (ref.startsWith('link:') || ref.startsWith('file:') || ref.startsWith('workspace:')) return null;
  if (ref.startsWith('npm:')) return ref.slice(4);
  return `${name}@${ref}`;
}

export function parsePnpmLock(text) {
  const doc = parseYamlSubset(text);
  const nodes = new Map();

  for (const [id, snap] of Object.entries(doc.snapshots ?? {})) {
    const { name, version } = splitPnpmKey(id);
    nodes.set(id, { id, name, version, deps: [], optional: snap?.optional === 'true' });
  }
  for (const [id, snap] of Object.entries(doc.snapshots ?? {})) {
    const node = nodes.get(id);
    for (const section of ['dependencies', 'optionalDependencies']) {
      for (const [depName, ref] of Object.entries(snap?.[section] ?? {})) {
        const depId = pnpmRefToId(depName, ref);
        if (depId && nodes.has(depId)) node.deps.push(depId);
      }
    }
  }

  const importer = doc.importers?.['.'] ?? {};
  const direct = { dependencies: {}, devDependencies: {}, optionalDependencies: {} };
  for (const section of Object.keys(direct)) {
    for (const [name, entry] of Object.entries(importer[section] ?? {})) {
      const id = pnpmRefToId(name, entry?.version);
      if (id && nodes.has(id)) direct[section][name] = id;
    }
  }
  return { pm: 'pnpm', nodes, direct, lockfileVersion: doc.lockfileVersion ?? null };
}

// Walk up `node_modules` levels the way Node resolution does.
function resolveNpm(fromKey, name, packages) {
  let base = fromKey;
  for (;;) {
    const cand = `${base ? `${base}/` : ''}node_modules/${name}`;
    if (packages[cand]) return cand;
    if (!base) return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i >= 0 ? base.slice(0, i) : '';
  }
}

export function parseNpmLock(lock) {
  const packages = lock.packages ?? {};
  const nodes = new Map();

  for (const [key, p] of Object.entries(packages)) {
    if (key === '' || p.link) continue;
    const name = p.name ?? key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    nodes.set(key, { id: key, name, version: p.version ?? '', deps: [], optional: !!p.optional });
  }
  for (const [key, node] of nodes) {
    const p = packages[key];
    const names = new Set([
      ...Object.keys(p.dependencies ?? {}),
      ...Object.keys(p.optionalDependencies ?? {}),
      ...Object.keys(p.peerDependencies ?? {}),
    ]);
    for (const dep of names) {
      const id = resolveNpm(key, dep, packages);
      if (id && nodes.has(id)) node.deps.push(id);
    }
  }

  const root = packages[''] ?? {};
  const direct = { dependencies: {}, devDependencies: {}, optionalDependencies: {} };
  for (const section of Object.keys(direct)) {
    for (const name of Object.keys(root[section] ?? {})) {
      const id = resolveNpm('', name, packages);
      if (id && nodes.has(id)) direct[section][name] = id;
    }
  }
  return { pm: 'npm', nodes, direct, lockfileVersion: lock.lockfileVersion ?? null };
}
