// Deterministic findings. Every rule here is documented in reference/rules.md —
// keep the two in step. A finding states a FACT with evidence; whether it is
// worth acting on is the agent's judgement (Step 3), not this file's.

import { MB, fmtBytes, major } from './format.mjs';

export const THRESHOLDS = {
  heavyProdMedium: 30 * MB, // exclusive bytes of a production dependency
  heavyProdLow: 10 * MB,
  heavyDevLow: 50 * MB, // dev tooling is only reported when it is very large
  multiVersionMedium: 3 * MB, // extra bytes of duplicate copies of one package
  multiVersionLow: 512 * 1024,
  unusedMedium: 5 * MB,
  placementMedium: 5 * MB,
};

const SEVERITY_WEIGHT = { high: 100, medium: 50, low: 20, info: 5 };

// Higher = look at it first. Documented in reference/prioritization.md.
export function scoreOf(f) {
  const sizeBonus = f.bytes ? Math.min(40, Math.round(15 * Math.log10(1 + f.bytes / MB))) : 0;
  return SEVERITY_WEIGHT[f.severity] + sizeBonus + (f.prod ? 10 : 0);
}

const removeCmd = (m, name) =>
  m.pm === 'pnpm' ? `pnpm --dir ${m.dir} remove ${name}` : `npm --prefix ${m.dir} uninstall ${name}`;
const addDevCmd = (m, name) =>
  m.pm === 'pnpm' ? `pnpm --dir ${m.dir} add -D ${name}` : `npm --prefix ${m.dir} install -D ${name}`;

export function buildFindings(modules, repo = {}) {
  const out = [];
  const push = (f) => out.push({ confidence: 'certain', bytes: null, prod: false, ...f });

  for (const m of modules) {
    if (!m.installed && m.pm !== 'none') {
      push({
        rule: 'NOT_INSTALLED', severity: 'info', module: m.dir, package: null,
        title: `${m.dir}: node_modules is missing`,
        evidence: 'Sizes for this module are n/a.',
        fix: `Install with the module's own manager (${m.pm}), then re-run the checker.`,
      });
    }

    for (const d of m.directs) {
      const prod = d.kind !== 'dev';
      const ex = d.exclusiveBytes ?? 0;

      // HEAVY ------------------------------------------------------------
      const heavySev = prod
        ? ex >= THRESHOLDS.heavyProdMedium ? 'medium' : ex >= THRESHOLDS.heavyProdLow ? 'low' : null
        : ex >= THRESHOLDS.heavyDevLow ? 'low' : null;
      if (heavySev) {
        push({
          rule: 'HEAVY', severity: heavySev, module: m.dir, package: d.name, prod, bytes: ex,
          confidence: 'verify',
          title: `${m.dir}: ${d.name} frees ${fmtBytes(ex)} when removed`,
          evidence: `${d.kind} ${d.name}@${d.version}: own ${fmtBytes(d.ownBytes)}, ` +
            `reach ${fmtBytes(d.reachBytes)} (${d.transitiveCount} transitive), exclusive ${fmtBytes(ex)}.`,
          fix: 'Check for a lighter alternative, a narrower import, or lazy loading. Core frameworks are expected weight — say so under "Accepted".',
        });
      }

      // UNUSED / PLACEMENT ----------------------------------------------
      const u = d.usage;
      if (u && !u.used && d.kind !== 'optional') {
        push({
          rule: 'UNUSED', severity: ex >= THRESHOLDS.unusedMedium ? 'medium' : 'low',
          module: m.dir, package: d.name, prod, bytes: ex, confidence: 'verify',
          title: `${m.dir}: ${d.name} is declared but never referenced`,
          evidence: `No import, config mention, script binary or @types link found for ${d.name} in ${m.dir}/ (${m.imports.files} files scanned).`,
          fix: `Confirm it is not loaded implicitly (peer of another package, plugin by name, CLI in CI), then \`${removeCmd(m, d.name)}\`.`,
        });
      } else if (u && d.kind === 'dev' && u.src) {
        push({
          rule: 'PLACEMENT', severity: 'high', module: m.dir, package: d.name, prod: true,
          title: `${m.dir}: devDependency ${d.name} is imported from runtime source`,
          evidence: `${d.name} is in devDependencies but imported from src: ${u.files.join(', ')}.`,
          fix: `A production install (\`--prod\` / \`--omit=dev\`) will not have it. Move it to dependencies.`,
        });
      } else if (u && d.kind === 'prod' && u.used && !u.src && (u.test || u.config || u.script || u.typesOf)) {
        push({
          rule: 'PLACEMENT', severity: ex >= THRESHOLDS.placementMedium ? 'medium' : 'low',
          module: m.dir, package: d.name, prod: true, bytes: ex,
          confidence: d.name.startsWith('@types/') ? 'certain' : 'verify',
          title: `${m.dir}: dependency ${d.name} is only used by tests/config/tooling`,
          evidence: `${d.name} is in dependencies, but no runtime source imports it ` +
            `(test:${u.test ? 'yes' : 'no'}, config:${u.config ? 'yes' : 'no'}, script:${u.script ? 'yes' : 'no'}).`,
          fix: `Move to devDependencies (\`${addDevCmd(m, d.name)}\`) — it would leave the production install (${fmtBytes(ex)} exclusive).`,
        });
      }
    }

    // PHANTOM --------------------------------------------------------------
    for (const p of m.imports.phantom) {
      push({
        rule: 'PHANTOM', severity: p.src > 0 ? 'high' : 'medium', module: m.dir, package: p.name, prod: p.src > 0,
        title: `${m.dir}: ${p.name} is imported but not declared`,
        evidence: `${p.name} is imported (src ${p.src}, test ${p.test}, config ${p.config}) — e.g. ${p.files.join(', ')} — ` +
          `but is not in ${m.dir}/package.json. It only resolves because another package hoisted it.`,
        fix: `Declare it: \`${addDevCmd(m, p.name).replace(' -D', p.src > 0 ? '' : ' -D')}\`.`,
      });
    }

    // MULTI_VERSION --------------------------------------------------------
    for (const mv of m.multiVersion) {
      const sev = mv.extraBytes >= THRESHOLDS.multiVersionMedium ? 'medium'
        : mv.extraBytes >= THRESHOLDS.multiVersionLow ? 'low' : null;
      if (!sev) continue;
      push({
        rule: 'MULTI_VERSION', severity: sev, module: m.dir, package: mv.name, bytes: mv.extraBytes,
        confidence: 'verify',
        title: `${m.dir}: ${mv.name} is installed at ${mv.versions.length} versions`,
        evidence: mv.versions.map((v) => `${v.version} (${fmtBytes(v.bytes)}, via ${v.pulledBy.join(', ') || 'direct'})`).join('; '),
        fix: 'Align the callers on one version (a range bump, or an override/resolution) — duplicates are not removable by hand.',
      });
    }

    // DUAL_INSTANCE (source-level links between modules) -------------------
    for (const edge of m.aliasEdges) {
      const owner = modules.find((x) => x.dir === edge.to);
      if (!owner) continue;
      for (const ext of edge.externals) {
        const mine = m.versionsByName[ext.name];
        const theirs = owner.versionsByName[ext.name];
        const declaredHere = m.directs.some((d) => d.name === ext.name) || m.declaredOnly.some((d) => d.name === ext.name);
        if (!mine || !theirs || !declaredHere) continue;
        const pinned = edge.pinned.includes(ext.name);
        const same = mine.length === 1 && theirs.length === 1 && mine[0] === theirs[0];
        const sev = !same ? 'high' : pinned ? 'info' : 'medium';
        const ownerBytes = owner.directs.find((d) => d.name === ext.name)?.ownBytes ?? null;
        push({
          rule: 'DUAL_INSTANCE', severity: sev, module: m.dir, package: ext.name, confidence: 'verify',
          bytes: same ? null : ownerBytes,
          title: `${m.dir} ⇄ ${edge.to}: ${ext.name} can be loaded from two copies`,
          evidence: `${m.dir} compiles ${edge.to} source via alias (${edge.aliases.join(', ')}); that source imports ${ext.name} ` +
            `(${ext.files.join(', ')}). It resolves from ${edge.to}/node_modules (${theirs.join(', ')}) while ${m.dir}'s own code uses ` +
            `${m.dir}/node_modules (${mine.join(', ')})${pinned ? `; ${m.dir}/tsconfig pins it to one copy` : ''}.`,
          fix: same
            ? pinned ? 'Pinned for types. Runtime identity still differs — never rely on instanceof across the boundary.'
              : `Pin ${ext.name} in ${m.dir}/tsconfig paths, and avoid instanceof/identity checks across the boundary.`
            : `Versions differ: types and runtime behaviour can diverge. Align ${ext.name} in both modules.`,
        });
      }
    }
  }

  // CROSS_MODULE_DRIFT ------------------------------------------------------
  const byName = new Map();
  for (const m of modules) {
    for (const d of m.directs) {
      if (!byName.has(d.name)) byName.set(d.name, []);
      byName.get(d.name).push({ module: m.dir, version: d.version, specifier: d.specifier, kind: d.kind });
    }
  }
  const drift = [];
  for (const [name, uses] of byName) {
    if (uses.length < 2) continue;
    const versions = new Set(uses.map((u) => u.version));
    if (versions.size < 2) continue;
    const majors = new Set(uses.map((u) => major(u.version)));
    const prod = uses.some((u) => u.kind !== 'dev');
    drift.push({ name, uses, majorDiffers: majors.size > 1 });
    push({
      rule: 'CROSS_MODULE_DRIFT', severity: majors.size > 1 ? 'medium' : 'low', module: uses.map((u) => u.module).join(', '),
      package: name, prod,
      title: `${name} resolves to different versions across modules`,
      evidence: uses.map((u) => `${u.module}: ${u.version} (${u.specifier})`).join('; '),
      fix: majors.size > 1
        ? 'Majors differ — behaviour and types can differ between modules. Pick one major, or record why they diverge.'
        : 'Same major. Align the specifiers so lockfiles resolve the same release.',
    });
  }

  // VENDOR_DRIFT (informational: the repo documents that copies drift) --------
  for (const v of repo.vendorDrift ?? []) {
    if (v.identical) continue;
    push({
      rule: 'VENDOR_DRIFT', severity: 'info', module: v.modules.join(', '), package: v.name,
      title: `vendor/${v.name} differs between ${v.modules.join(' and ')}`,
      evidence: `${v.differing.length} file(s) differ, ${v.onlyIn.map((o) => `${o.files.length} only in ${o.module}`).join(', ')}.`,
      fix: 'Change a shared contract in both copies in the same commit; some differences are deliberate (see CLAUDE.md).',
    });
  }

  // Online results (if collected) are folded in by collect.mjs via `extra`.
  return rank(out);
}

export function rank(findings) {
  const scored = findings.map((f) => ({ ...f, score: scoreOf(f) }));
  scored.sort((a, b) => b.score - a.score || a.module.localeCompare(b.module) || String(a.package).localeCompare(String(b.package)));
  return scored.map((f, i) => ({ id: `F-${String(i + 1).padStart(2, '0')}`, ...f }));
}
