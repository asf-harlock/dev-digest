// Graph analysis for ONE module. Pure: takes the normalised lock graph, the
// package.json declarations and a sizer; returns plain numbers.
//
// Vocabulary (used verbatim in the report):
//   own        bytes of the package's own files
//   reach      the package plus everything it pulls in transitively — except
//              packages that are themselves declared in package.json: a declared
//              dependency is a boundary and is counted for itself (a peer such
//              as `next` under `next-intl` is not credited to next-intl)
//   exclusive  bytes of reach that NO other direct dependency of this module
//              also pulls in — i.e. what `remove <pkg>` would really free
//   shared     reach minus exclusive

const keyOf = (n) => `${n.name}@${n.version}`;

const KIND_BY_SECTION = {
  dependencies: 'prod',
  devDependencies: 'dev',
  optionalDependencies: 'optional',
};

export function analyzeGraph(graph, declared, sizeOf) {
  // --- per-key bookkeeping (peer-variants of one version collapse to one key) ---
  const meta = new Map(); // key -> {name, version}
  const bytes = new Map(); // key -> number | null
  for (const n of graph.nodes.values()) {
    const k = keyOf(n);
    if (meta.has(k)) continue;
    meta.set(k, { name: n.name, version: n.version });
    bytes.set(k, sizeOf(n)?.bytes ?? null);
  }
  const b = (k) => bytes.get(k) ?? 0;

  const directIds = new Set();
  for (const section of Object.keys(KIND_BY_SECTION)) {
    for (const id of Object.values(graph.direct[section] ?? {})) directIds.add(id);
  }
  const dependedOnBy = new Map(); // direct id -> names of other directs that depend on it

  function reachKeys(startId, startName) {
    const seenIds = new Set();
    const keys = new Set();
    const stack = [startId];
    while (stack.length) {
      const id = stack.pop();
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const node = graph.nodes.get(id);
      if (!node) continue;
      keys.add(keyOf(node));
      for (const d of node.deps) {
        if (directIds.has(d) && d !== startId) {
          if (!dependedOnBy.has(d)) dependedOnBy.set(d, new Set());
          dependedOnBy.get(d).add(startName);
          continue; // boundary: counted for itself
        }
        stack.push(d);
      }
    }
    return keys;
  }

  // --- direct dependencies as the lockfile resolved them ---
  const directs = [];
  for (const [section, kind] of Object.entries(KIND_BY_SECTION)) {
    for (const [name, id] of Object.entries(graph.direct[section] ?? {})) {
      const node = graph.nodes.get(id);
      if (!node) continue;
      directs.push({
        name,
        kind,
        id,
        key: keyOf(node),
        version: node.version,
        specifier: declared[name]?.specifier ?? null,
        reach: reachKeys(id, name),
      });
    }
  }

  const cover = new Map(); // key -> how many direct deps reach it
  const pulledBy = new Map(); // key -> direct names
  for (const d of directs) {
    for (const k of d.reach) {
      cover.set(k, (cover.get(k) ?? 0) + 1);
      if (!pulledBy.has(k)) pulledBy.set(k, []);
      pulledBy.get(k).push(d.name);
    }
  }

  const prodKeys = new Set();
  const allKeys = new Set();
  for (const d of directs) {
    for (const k of d.reach) {
      allKeys.add(k);
      if (d.kind !== 'dev') prodKeys.add(k);
    }
  }
  let installedBytes = 0;
  let prodBytes = 0;
  let notInstalled = 0;
  for (const k of allKeys) {
    installedBytes += b(k);
    if (prodKeys.has(k)) prodBytes += b(k);
    if (bytes.get(k) == null) notInstalled++;
  }

  const rows = directs.map((d) => {
    let weight = 0;
    let exclusive = 0;
    for (const k of d.reach) {
      weight += b(k);
      if (cover.get(k) === 1) exclusive += b(k);
    }
    const children = [...d.reach]
      .filter((k) => k !== d.key)
      .map((k) => ({ ...meta.get(k), bytes: b(k) }))
      .sort((x, y) => y.bytes - x.bytes)
      .slice(0, 5);
    return {
      name: d.name,
      kind: d.kind,
      version: d.version,
      specifier: d.specifier,
      installed: bytes.get(d.key) != null,
      ownBytes: bytes.get(d.key),
      reachBytes: weight,
      exclusiveBytes: exclusive,
      sharedBytes: weight - exclusive,
      transitiveCount: d.reach.size - 1,
      pulledByOthers: [...(dependedOnBy.get(d.id) ?? [])].filter((n) => n !== d.name).slice(0, 3),
      topChildren: children,
    };
  });

  // --- the heaviest packages in the module, declared or not ---
  const heaviest = [...allKeys]
    .map((k) => ({ ...meta.get(k), bytes: b(k), pulledBy: (pulledBy.get(k) ?? []).slice(0, 4) }))
    .sort((x, y) => y.bytes - x.bytes)
    .slice(0, 10);

  // --- one name resolved at several versions ---
  const byName = new Map();
  for (const k of allKeys) {
    const { name, version } = meta.get(k);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ version, bytes: b(k), runtime: prodKeys.has(k), pulledBy: (pulledBy.get(k) ?? []).slice(0, 3) });
  }
  const multiVersion = [];
  for (const [name, versions] of byName) {
    if (versions.length < 2) continue;
    const total = versions.reduce((s, v) => s + v.bytes, 0);
    const max = Math.max(...versions.map((v) => v.bytes));
    multiVersion.push({ name, versions, extraBytes: total - max, onRuntimePath: versions.some((v) => v.runtime) });
  }
  multiVersion.sort((x, y) => y.extraBytes - x.extraBytes || x.name.localeCompare(y.name));

  const versionsByName = Object.fromEntries(
    [...byName].map(([name, vs]) => [name, vs.map((v) => v.version)]),
  );

  return {
    totals: {
      packages: allKeys.size,
      installedBytes,
      prodBytes,
      devOnlyBytes: installedBytes - prodBytes,
      notInstalled,
    },
    directs: rows.sort((x, y) => (y.exclusiveBytes ?? 0) - (x.exclusiveBytes ?? 0) || x.name.localeCompare(y.name)),
    heaviest,
    multiVersion,
    versionsByName,
  };
}
