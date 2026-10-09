// Renders report.md from metrics.json. Everything here is mechanical: tables,
// bars and Mermaid diagrams are generated from numbers, never hand-drawn, so a
// diagram can never show an edge the data does not contain. The three
// judgement blocks (summary, priorities, advice) are left as marked
// placeholders for the agent — see reference/report-template.md.

import { fmtBytes, bar, cell, mmLabel, mmText, pct, MB } from './format.mjs';

export const JUDGEMENT_BLOCKS = ['summary', 'priorities', 'advice'];
export const PENDING = '_Pending — written by the agent in Step 3 of SKILL.md._';

const HEAVY_EXCL = 30 * MB;
const MID_EXCL = 5 * MB;

const id = (s) => `n_${String(s).replace(/[^A-Za-z0-9]/g, '_')}`;

export function judgementBlock(name) {
  return `<!-- judgement:${name} -->\n${PENDING}\n<!-- /judgement:${name} -->`;
}

const CLASSDEFS = [
  'classDef mod fill:#dbeafe,stroke:#2b6cb0,color:#111,stroke-width:2px',
  'classDef heavy fill:#fbcaca,stroke:#c0392b,color:#111',
  'classDef mid fill:#fde68a,stroke:#b7791f,color:#111',
  'classDef light fill:#d1fae5,stroke:#2f855a,color:#111',
  'classDef na fill:#e5e7eb,stroke:#6b7280,color:#111,stroke-dasharray:4 3',
];

function tier(d) {
  if (d.exclusiveBytes == null || !d.installed) return 'na';
  if (d.exclusiveBytes >= HEAVY_EXCL) return 'heavy';
  if (d.exclusiveBytes >= MID_EXCL) return 'mid';
  return 'light';
}

// ---- diagrams -------------------------------------------------------------

export function componentMapDiagram(modules, vendorDrift) {
  const L = ['flowchart LR'];
  for (const pm of ['pnpm', 'npm']) {
    const group = modules.filter((m) => m.pm === pm);
    if (!group.length) continue;
    L.push(`  subgraph g_${pm}["${pm} modules"]`);
    for (const m of group) {
      const t = m.totals;
      L.push(
        `    ${id(m.dir)}["${mmLabel(
          m.packageName,
          `${m.dir}/`,
          `${m.declaredCounts.prod} prod · ${m.declaredCounts.dev} dev`,
          t ? `${fmtBytes(t.installedBytes)} installed` : 'no graph',
        )}"]`,
      );
    }
    L.push('  end');
  }
  for (const m of modules.filter((x) => x.pm !== 'pnpm' && x.pm !== 'npm')) {
    L.push(`  ${id(m.dir)}["${mmLabel(m.packageName, `${m.dir}/`, 'no supported lockfile')}"]`);
  }
  for (const m of modules) {
    for (const e of m.aliasEdges) {
      const label = e.aliases.slice(0, 2).join(', ') + (e.aliases.length > 2 ? ` +${e.aliases.length - 2}` : '');
      L.push(`  ${id(e.from)} -->|"${mmText(label)} (source)"| ${id(e.to)}`);
    }
  }
  for (const m of modules) {
    const byTarget = new Map();
    for (const c of m.imports.crossings) byTarget.set(c.to, (byTarget.get(c.to) ?? 0) + 1);
    for (const [to, n] of byTarget) {
      if (modules.some((x) => x.dir === to)) L.push(`  ${id(m.dir)} -.->|"⚠ ${n} relative import(s), bypass"| ${id(to)}`);
    }
  }
  for (const v of vendorDrift) {
    const label = v.identical ? `vendor/${v.name}: identical copy` : `vendor/${v.name}: ${v.differing.length} differ`;
    L.push(`  ${id(v.modules[0])} -.-|"${mmText(label)}"| ${id(v.modules[1])}`);
  }
  L.push(...CLASSDEFS.map((c) => `  ${c}`));
  L.push(`  class ${modules.map((m) => id(m.dir)).join(',')} mod`);
  return L.join('\n');
}

export function sizePie(modules) {
  const rows = modules.filter((m) => m.totals?.installedBytes);
  if (!rows.length) return null;
  return [
    'pie showData title Installed size by module (MB)',
    ...rows.map((m) => `  "${mmText(m.dir)}" : ${(m.totals.installedBytes / MB).toFixed(1)}`),
  ].join('\n');
}

export function moduleWeightDiagram(m, top) {
  const ranked = m.directs.filter((d) => (d.exclusiveBytes ?? 0) > 0 || d.installed);
  if (!ranked.length) return null;
  const shown = ranked.slice(0, Math.min(top, 12));
  const rest = ranked.slice(shown.length);
  const L = ['flowchart LR', `  ${id(m.dir)}["${mmLabel(m.packageName, fmtBytes(m.totals?.installedBytes))}"]`];

  const group = (title, key, items) => {
    if (!items.length) return;
    L.push(`  subgraph ${key}["${title}"]`);
    for (const d of items) {
      L.push(
        `    ${id(`${m.dir}_${d.name}`)}["${mmLabel(
          `${d.name}@${d.version}`,
          `own ${fmtBytes(d.ownBytes)}`,
          `exclusive ${fmtBytes(d.exclusiveBytes)}`,
        )}"]:::${tier(d)}`,
      );
    }
    L.push('  end');
  };
  group('dependencies', `p_${id(m.dir)}`, shown.filter((d) => d.kind !== 'dev'));
  group('devDependencies', `d_${id(m.dir)}`, shown.filter((d) => d.kind === 'dev'));
  for (const d of shown) L.push(`  ${id(m.dir)} --> ${id(`${m.dir}_${d.name}`)}`);

  if (rest.length) {
    const restBytes = rest.reduce((s, d) => s + (d.exclusiveBytes ?? 0), 0);
    L.push(`  ${id(`${m.dir}_rest`)}["${mmLabel(`+${rest.length} more`, `exclusive ${fmtBytes(restBytes)}`)}"]:::light`);
    L.push(`  ${id(m.dir)} --> ${id(`${m.dir}_rest`)}`);
  }

  // Expand the three heaviest dependencies one level, to answer "why is it big".
  for (const d of shown.slice(0, 3)) {
    d.topChildren.filter((c) => c.bytes >= 256 * 1024).slice(0, 3).forEach((c, i) => {
      const cid = id(`${m.dir}_${d.name}_c${i}`);
      L.push(`  ${cid}["${mmLabel(`${c.name}@${c.version}`, fmtBytes(c.bytes))}"]:::light`);
      L.push(`  ${id(`${m.dir}_${d.name}`)} -.-> ${cid}`);
    });
  }
  L.push(...CLASSDEFS.map((c) => `  ${c}`));
  L.push(`  class ${id(m.dir)} mod`);
  return L.join('\n');
}

export function overlapDiagram(modules, limit = 15) {
  const byName = new Map();
  for (const m of modules) {
    for (const d of m.directs) {
      if (!byName.has(d.name)) byName.set(d.name, []);
      byName.get(d.name).push({ module: m.dir, version: d.version, own: d.ownBytes ?? 0 });
    }
  }
  const shared = [...byName]
    .filter(([, uses]) => uses.length >= 2)
    .sort((a, b) => Math.max(...b[1].map((u) => u.own)) - Math.max(...a[1].map((u) => u.own)));
  if (!shared.length) return { diagram: null, total: 0, shown: 0 };
  const picked = shared.slice(0, limit);
  const L = ['flowchart LR'];
  const usedModules = new Set();
  for (const [name, uses] of picked) {
    L.push(`  ${id(`pkg_${name}`)}(["${mmLabel(name)}"])`);
    for (const u of uses) {
      usedModules.add(u.module);
      L.push(`  ${id(`pkg_${name}`)} -->|"${mmText(u.version)}"| ${id(u.module)}`);
    }
  }
  for (const mod of usedModules) L.push(`  ${id(mod)}["${mmLabel(`${mod}/`)}"]`);
  L.push(...CLASSDEFS.map((c) => `  ${c}`));
  L.push(`  class ${[...usedModules].map(id).join(',')} mod`);
  return { diagram: L.join('\n'), total: shared.length, shown: picked.length };
}

// ---- tables ---------------------------------------------------------------

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');
}

const fence = (lang, body) => `\`\`\`${lang}\n${body}\n\`\`\``;

function usageLabel(u) {
  if (!u) return '—';
  const parts = [u.src && 'src', u.test && 'test', u.config && 'config', u.script && 'script', u.typesOf && 'types'].filter(Boolean);
  return parts.length ? parts.join('+') : 'none';
}

function summaryTable(modules, findings) {
  const sum = (f) => modules.reduce((s, m) => s + (f(m) ?? 0), 0);
  const total = sum((m) => m.totals?.installedBytes);
  const sev = (s) => findings.filter((f) => f.severity === s).length;
  return table(['Metric', 'Value'], [
    ['Modules', `${modules.length} (${modules.map((m) => m.dir).join(', ')})`],
    ['Direct dependencies (prod / dev)', `${sum((m) => m.declaredCounts.prod + m.declaredCounts.optional)} / ${sum((m) => m.declaredCounts.dev)}`],
    ['Package installs (sum of modules)', String(sum((m) => m.totals?.packages))],
    ['Installed size, all modules', fmtBytes(total)],
    ['…of which on the runtime path', `${fmtBytes(sum((m) => m.totals?.prodBytes))} (${pct(sum((m) => m.totals?.prodBytes), total)})`],
    ['…of which dev tooling only', `${fmtBytes(sum((m) => m.totals?.devOnlyBytes))} (${pct(sum((m) => m.totals?.devOnlyBytes), total)})`],
    ['Findings', `${findings.length} — high ${sev('high')}, medium ${sev('medium')}, low ${sev('low')}, info ${sev('info')}`],
  ]);
}

function modulesTable(modules) {
  const max = Math.max(...modules.map((m) => m.totals?.installedBytes ?? 0));
  return table(
    ['Module', 'Manager', 'Direct prod / dev', 'Packages', 'Installed', 'Runtime path', 'Dev only', ''],
    modules.map((m) => [
      `${m.dir}/`,
      m.pm,
      `${m.declaredCounts.prod + m.declaredCounts.optional} / ${m.declaredCounts.dev}`,
      m.totals?.packages ?? 'n/a',
      fmtBytes(m.totals?.installedBytes),
      fmtBytes(m.totals?.prodBytes),
      fmtBytes(m.totals?.devOnlyBytes),
      bar(m.totals?.installedBytes, max),
    ]),
  );
}

function edgesSection(modules, vendorDrift) {
  const edges = modules.flatMap((m) => m.aliasEdges);
  const out = [];
  if (edges.length) {
    out.push(
      '**Source-level links** (tsconfig `paths` — nothing is published; the importer compiles the sibling\'s source):',
      '',
      table(
        ['From', 'To', 'Alias', 'External packages the linked source imports'],
        edges.map((e) => [`${e.from}/`, `${e.to}/`, e.aliases.join(', '), e.externals.map((x) => x.name).join(', ') || '—']),
      ),
    );
  } else out.push('_No tsconfig path alias points into a sibling module._');
  if (vendorDrift.length) {
    out.push(
      '',
      '**Vendored copies** (`src/vendor/<name>` present in several modules):',
      '',
      table(
        ['Copy', 'Modules', 'Files', 'Differing', 'Only in one side'],
        vendorDrift.map((v) => [
          `vendor/${v.name}`,
          v.modules.join(' ↔ '),
          Object.entries(v.files).map(([k, n]) => `${k}: ${n}`).join(', '),
          v.identical ? 'identical' : String(v.differing.length),
          v.onlyIn.map((o) => `${o.module}: ${o.files.length}`).join(', '),
        ]),
      ),
    );
  }
  return out.join('\n');
}

function moduleSection(m, index, top) {
  const out = [`### ${m.dir}/ — ${m.packageName}`, ''];
  if (!m.totals) {
    out.push(`_No graph: ${m.notes.join(' ')}_`);
    return out.join('\n');
  }
  const t = m.totals;
  out.push(
    `${m.pm} · ${t.packages} packages · **${fmtBytes(t.installedBytes)}** installed ` +
      `(runtime path ${fmtBytes(t.prodBytes)}, dev-only ${fmtBytes(t.devOnlyBytes)}` +
      `${t.notInstalled ? `, ${t.notInstalled} locked packages not installed on this platform` : ''}).`,
  );
  if (m.notes.length) out.push('', ...m.notes.map((n) => `> ${n}`));
  const diagram = moduleWeightDiagram(m, top);
  if (diagram) out.push('', fence('mermaid', diagram));
  const rows = m.directs.slice(0, top);
  const max = Math.max(...rows.map((d) => d.exclusiveBytes ?? 0), 1);
  out.push(
    '',
    `Top ${rows.length} of ${m.directs.length} direct dependencies by exclusive size:`,
    '',
    table(
      ['Package', 'Kind', 'Version', 'Own', 'Exclusive', 'Reach', 'Transitive', 'Used in', ''],
      rows.map((d) => [
        d.name, d.kind, d.version, fmtBytes(d.ownBytes), fmtBytes(d.exclusiveBytes), fmtBytes(d.reachBytes),
        d.transitiveCount, usageLabel(d.usage), bar(d.exclusiveBytes, max),
      ]),
    ),
    '',
    'Heaviest packages in the module, declared or not:',
    '',
    table(
      ['Package', 'Size', 'Pulled in by'],
      m.heaviest.map((h) => [`${h.name}@${h.version}`, fmtBytes(h.bytes), h.pulledBy.join(', ') || '(direct)']),
    ),
  );
  if (m.multiVersion.length) {
    out.push(
      '',
      `Packages installed at more than one version: ${m.multiVersion.length}; top by duplicate bytes:`,
      '',
      table(
        ['Package', 'Versions', 'Duplicate cost'],
        m.multiVersion.slice(0, 5).map((v) => [v.name, v.versions.map((x) => x.version).join(', '), fmtBytes(v.extraBytes)]),
      ),
    );
  }
  return out.join('\n');
}

function overlapSection(modules) {
  const { diagram, total, shown } = overlapDiagram(modules);
  if (!diagram) return '_No package is declared directly in more than one module._';
  const byName = new Map();
  for (const m of modules) for (const d of m.directs) {
    if (!byName.has(d.name)) byName.set(d.name, {});
    byName.get(d.name)[m.dir] = d.version;
  }
  const rows = [...byName]
    .filter(([, v]) => Object.keys(v).length >= 2)
    .map(([name, v]) => [name, ...modules.map((m) => v[m.dir] ?? '—'), new Set(Object.values(v)).size > 1 ? 'differs' : 'same']);
  return [
    fence('mermaid', diagram),
    total > shown ? `\n_Diagram shows ${shown} of ${total} shared packages (largest first); the table lists all._` : '',
    '',
    table(['Package', ...modules.map((m) => `${m.dir}/`), 'Resolved'], rows),
  ].join('\n');
}

function findingsSection(findings, online) {
  if (!findings.length) return '_No findings._';
  const byRule = new Map();
  for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
  const out = [
    `Ranked by score (severity + size + runtime-path weight; see \`reference/prioritization.md\`). By rule: ${[...byRule].map(([r, n]) => `${r} ${n}`).join(' · ')}.`,
    '',
    table(
      ['ID', 'Sev', 'Rule', 'Where', 'What', 'Size', 'Conf.'],
      findings.map((f) => [
        f.id, f.severity, f.rule, f.package ? `${f.module} · ${f.package}` : f.module, f.title,
        f.bytes ? fmtBytes(f.bytes) : '—', f.confidence,
      ]),
    ),
    '',
    '<details><summary>Evidence and suggested fix per finding</summary>',
    '',
    ...findings.map((f) => `- **${f.id}** — ${f.evidence}  \n  _Fix:_ ${f.fix}`),
    '',
    '</details>',
  ];
  if (online) {
    out.push(
      '',
      `Registry checks: ${online.ran.join(', ') || 'none'}${online.errors.length ? ` · errors: ${online.errors.join('; ')}` : ''}.`,
    );
  }
  return out.join('\n');
}

function methodSection(metrics) {
  const { meta } = metrics;
  return [
    `- Collected by \`scripts/collect.mjs\` on ${meta.platform}, Node ${meta.node}.`,
    '- **Size** = apparent bytes of regular files in each package\'s own directory (symlinks not followed, nested `node_modules` counted as their own packages), 1 MB = 1024². It is *installed* size on this machine — not download size, not bundle size, and platform binaries for other OSes are absent.',
    '- **Exclusive** = bytes only that direct dependency pulls in within its module; shared transitive packages are not credited to any single dependency.',
    '- **Used in** comes from a regex scan of source text plus config/script mentions — a heuristic. `none` means "nothing found", so rules built on it carry confidence `verify`.',
    '- The graph comes from the lockfile; a module without `node_modules` has no sizes. The checker never installs, updates or edits anything.',
  ].join('\n');
}

// ---- the report -------------------------------------------------------------

export const SECTION_HEADINGS = ['Scope', 'Dependency graph', 'Size breakdown', 'Findings & Priorities', 'Summary'];

function scopeSection(metrics) {
  const { modules, meta } = metrics;
  const checked = ['declared vs installed packages', 'installed size per package', 'unused / phantom / misplaced declarations',
    'duplicate versions', 'version drift across modules', 'internal links between modules'];
  const notChecked = meta.online ? [] : ['vulnerabilities', 'outdated versions', 'deprecations'];
  return [
    `Analysed ${modules.length} module(s): ${modules.map((m) => `\`${m.dir}/\``).join(', ')} — standalone packages, each with its own lockfile (this is not a workspace).`,
    '',
    table(
      ['Module', 'Package', 'Manager', 'Lockfile', 'node_modules', 'Direct prod / dev'],
      modules.map((m) => [
        `${m.dir}/`, m.packageName, m.pm, m.lockfile ?? '—', m.installed ? 'installed' : 'missing',
        `${m.declaredCounts.prod + m.declaredCounts.optional} / ${m.declaredCounts.dev}`,
      ]),
    ),
    '',
    `- **Mode:** ${meta.online ? 'online (the registry was queried through each module\'s own `audit` / `outdated`)' : 'offline (lockfiles, `node_modules` and source only)'}.`,
    `- **Checked:** ${checked.join('; ')}.`,
    `- **Not checked:** ${notChecked.length ? `${notChecked.join(', ')} — re-run with \`--online\`` : 'nothing skipped'}.`,
    '',
    methodSection(metrics),
  ].join('\n');
}

function externalOverlapNote(modules) {
  const internal = modules.flatMap((m) => m.aliasEdges).length + modules.reduce((n, m) => n + (m.imports.crossings.length ? 1 : 0), 0);
  const ext = new Set(modules.flatMap((m) => m.directs.map((d) => d.name))).size;
  return `**Internal** dependencies are links between our own modules (tsconfig path aliases that compile a sibling's source, and any relative import that reaches into one): ${internal} link(s). **External** dependencies are npm packages: ${ext} distinct direct dependencies across the modules.`;
}

function relativeImportTable(modules) {
  const rows = modules.flatMap((m) => {
    const byTarget = new Map();
    for (const c of m.imports.crossings) {
      if (!byTarget.has(c.to)) byTarget.set(c.to, []);
      byTarget.get(c.to).push(c);
    }
    return [...byTarget].map(([to, list]) => [
      `${m.dir}/`, `${to}/`, String(list.length), list.some((c) => c.kind === 'src') ? 'runtime source' : 'tests/config only',
      list.slice(0, 2).map((c) => `${c.file} → ${c.spec}`).join('; '),
    ]);
  });
  if (!rows.length) return '_No relative import crosses a module boundary — modules link only through tsconfig aliases._';
  return [
    '**Relative imports that cross a module boundary** (they bypass the alias and the public entry point):',
    '',
    table(['From', 'Into', 'Count', 'Where', 'Examples'], rows),
  ].join('\n');
}

export function renderReport(metrics, { top = 15 } = {}) {
  const { meta, modules, findings, vendorDrift } = metrics;
  const pie = sizePie(modules);
  const sev = (x) => findings.filter((f) => f.severity === x).length;
  return [
    `# Dependency report — ${meta.date}`,
    '',
    `> \`${meta.repo}\` @ \`${meta.head}\` · ${modules.length} modules · ${meta.online ? 'online' : 'offline'} · generated; the blocks marked judgement are written by the agent`,
    '',
    '## Scope',
    '',
    scopeSection(metrics),
    '',
    '## Dependency graph',
    '',
    '### Internal links between modules',
    '',
    externalOverlapNote(modules),
    '',
    fence('mermaid', componentMapDiagram(modules, vendorDrift)),
    '',
    edgesSection(modules, vendorDrift),
    '',
    relativeImportTable(modules),
    '',
    '### External packages shared across modules',
    '',
    overlapSection(modules),
    '',
    '## Size breakdown',
    '',
    '### At a glance',
    '',
    summaryTable(modules, findings),
    '',
    modulesTable(modules),
    ...(pie ? ['', fence('mermaid', pie)] : []),
    '',
    ...modules.flatMap((m, i) => [moduleSection(m, i + 1, top), '']),
    '## Findings & Priorities',
    '',
    '### Ranked findings',
    '',
    findingsSection(findings, metrics.online),
    '',
    '### Priorities',
    '',
    judgementBlock('priorities'),
    '',
    '### Advice',
    '',
    judgementBlock('advice'),
    '',
    '## Summary',
    '',
    `${findings.length} finding(s): high ${sev('high')}, medium ${sev('medium')}, low ${sev('low')}, info ${sev('info')}.`,
    '',
    judgementBlock('summary'),
    '',
  ].join('\n');
}
