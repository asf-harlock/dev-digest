// Deterministic findings. Every rule here is documented in references/rules.md —
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

// Packages whose identity matters at runtime: two copies break `instanceof`,
// context or singleton state across the boundary.
const IDENTITY_SENSITIVE = new Set(['zod', 'react', 'react-dom', '@tanstack/react-query']);

const SEVERITY_WEIGHT = { high: 100, medium: 50, low: 20, info: 5 };

// Higher = look at it first. Documented in references/prioritization.md.
export function scoreOf(f) {
  const sizeBonus = f.bytes ? Math.min(40, Math.round(15 * Math.log10(1 + f.bytes / MB))) : 0;
  return SEVERITY_WEIGHT[f.severity] + sizeBonus + (f.prod ? 10 : 0);
}

const removeCmd = (m, name) =>
  m.pm === 'pnpm' ? `pnpm --dir ${m.dir} remove ${name}` : `npm --prefix ${m.dir} uninstall ${name}`;
const addCmd = (m, name, dev) => {
  const flag = dev ? ' -D' : '';
  return m.pm === 'pnpm' ? `pnpm --dir ${m.dir} add${flag} ${name}` : `npm --prefix ${m.dir} install${flag} ${name}`;
};

export function buildFindings(modules, repo = {}, extra = []) {
  const out = [...extra];
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
          fix: 'Check for a lighter alternative, a narrower import, or lazy loading. Core frameworks are expected weight — say so under "Info".',
        });
      }

      // UNUSED / PLACEMENT ----------------------------------------------
      const u = d.usage;
      if (u && !u.used && d.kind !== 'optional') {
        // Another direct dependency already installs it (usually as a peer): the
        // declaration is redundant but removing it frees nothing.
        const peerOf = d.pulledByOthers ?? [];
        push({
          rule: 'UNUSED', severity: peerOf.length ? 'info' : ex >= THRESHOLDS.unusedMedium ? 'medium' : 'low',
          module: m.dir, package: d.name, prod, bytes: peerOf.length ? null : ex, confidence: 'verify',
          title: `${m.dir}: ${d.name} is declared but never referenced`,
          evidence: `No import, string reference, config mention, script binary or @types link found for ${d.name} in ${m.dir}/ (${m.imports.files} files scanned).` +
            (peerOf.length ? ` It is installed anyway by ${peerOf.join(', ')} — likely a peer dependency, so removing the declaration frees 0 B.` : ''),
          fix: `Confirm it is not loaded implicitly (peer of another package, plugin by name, CLI in CI), then \`${removeCmd(m, d.name)}\`.`,
        });
      } else if (u && d.kind === 'dev' && u.src) {
        // A built app (Next) bundles at build time, and a tooling-only package (e2e, evals) is never
        // installed with --prod: in both, "a devDependency imported from src" is not a production risk.
        const soft = m.bundled || m.tooling;
        push({
          rule: 'PLACEMENT', severity: soft ? 'low' : 'high', module: m.dir, package: d.name, prod: !soft,
          confidence: soft ? 'verify' : 'certain',
          title: `${m.dir}: devDependency ${d.name} is imported from runtime source`,
          evidence: `${d.name} is in devDependencies but imported from src: ${u.files.src.join(', ')}.` +
            (m.bundled ? ` ${m.dir} is a bundled app (declares next), so build-time availability may be enough.` : '') +
            (m.tooling ? ` ${m.dir} has no main/bin/exports and no start/dev/build script — it is tooling, not a shipped package.` : ''),
          fix: soft
            ? 'Usually fine here; move it to dependencies only if a production install of this package ever runs it.'
            : 'A production install (`--prod` / `--omit=dev`) will not have it. Move it to dependencies.',
        });
      } else if (u && d.kind === 'prod' && u.used && !u.src && (u.test || u.config || u.script || u.typesOf)) {
        push({
          rule: 'PLACEMENT', severity: ex >= THRESHOLDS.placementMedium ? 'medium' : 'low',
          module: m.dir, package: d.name, prod: true, bytes: ex,
          confidence: d.name.startsWith('@types/') ? 'certain' : 'verify',
          title: `${m.dir}: dependency ${d.name} is only used by tests/config/tooling`,
          evidence: `${d.name} is in dependencies, but no runtime source imports it ` +
            `(test:${u.test ? 'yes' : 'no'}, config:${u.config ? 'yes' : 'no'}, script:${u.script ? 'yes' : 'no'}).`,
          fix: `Move to devDependencies (\`${addCmd(m, d.name, true)}\`) — it would leave the production install (${fmtBytes(ex)} exclusive).`,
        });
      }
    }

    // BOUNDARY_BYPASS ------------------------------------------------------
    // One finding per target module. A relative path out of the package is invisible
    // to its tsconfig and its public entry, and breaks as soon as either module moves.
    const byTarget = new Map();
    for (const c of m.imports.crossings) {
      if (!byTarget.has(c.to)) byTarget.set(c.to, []);
      byTarget.get(c.to).push(c);
    }
    for (const [to, list] of byTarget) {
      const inSrc = list.some((c) => c.kind === 'src');
      push({
        rule: 'BOUNDARY_BYPASS', severity: inSrc ? 'high' : 'medium', module: m.dir, package: to, prod: inSrc,
        title: `${m.dir}: ${list.length} relative import(s) reach into ${to}/ instead of its alias or public entry`,
        evidence: list.slice(0, 3).map((c) => `${c.file} imports '${c.spec}'`).join('; ') + (list.length > 3 ? `; +${list.length - 3} more` : '') + '.',
        fix: `Import through the tsconfig path alias (or ${to}'s public entry point); modules here link only through aliases, never by a path out of the package.`,
      });
    }

    // PHANTOM --------------------------------------------------------------
    for (const p of m.imports.phantom) {
      push({
        rule: 'PHANTOM', severity: p.src > 0 ? 'high' : 'medium', module: m.dir, package: p.name, prod: p.src > 0,
        title: `${m.dir}: ${p.name} is imported but not declared`,
        evidence: `${p.name} is imported (src ${p.src}, test ${p.test}, config ${p.config}) — e.g. ${[...p.files.src, ...p.files.test, ...p.files.config].slice(0, 3).join(', ')} — ` +
          `but is not in ${m.dir}/package.json. It only resolves because another package hoisted it.`,
        fix: `Declare it: \`${addCmd(m, p.name, p.src === 0)}\`.`,
      });
    }

    // MULTI_VERSION --------------------------------------------------------
    // `@esbuild/darwin-arm64` is esbuild's own platform binary: fold it into `esbuild`.
    const mvs = m.multiVersion.map((mv) => ({ ...mv, folded: 0 }));
    for (const mv of mvs.filter((x) => x.name.startsWith('@'))) {
      const parent = mvs.find((x) => x.name === mv.name.slice(1).split('/')[0]);
      if (!parent) continue;
      parent.extraBytes += mv.extraBytes;
      parent.folded++;
      mv.skip = true;
    }
    for (const mv of mvs) {
      if (mv.skip) continue;
      let sev = mv.extraBytes >= THRESHOLDS.multiVersionMedium ? 'medium'
        : mv.extraBytes >= THRESHOLDS.multiVersionLow ? 'low' : null;
      if (!sev) continue;
      if (!mv.onRuntimePath) sev = 'low'; // duplicates that only dev tooling pulls in never ship
      push({
        rule: 'MULTI_VERSION', severity: sev, module: m.dir, package: mv.name, bytes: mv.extraBytes,
        prod: mv.onRuntimePath, confidence: 'verify',
        title: `${m.dir}: ${mv.name} is installed at ${mv.versions.length} versions${mv.onRuntimePath ? '' : ' (dev tooling only)'}`,
        evidence: mv.versions.map((v) => `${v.version} (${fmtBytes(v.bytes)}, via ${v.pulledBy.join(', ') || 'direct'})`).join('; ') +
          (mv.folded ? `. Includes ${mv.folded} platform-binary package(s) of the same tool.` : ''),
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
        const sev = !same ? 'high' : pinned ? 'info' : IDENTITY_SENSITIVE.has(ext.name) ? 'medium' : 'low';
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

  return rank(out);
}

export function rank(findings) {
  const scored = findings.map((f) => ({ ...f, score: scoreOf(f) }));
  scored.sort((a, b) => b.score - a.score || a.module.localeCompare(b.module) || String(a.package).localeCompare(String(b.package)));
  return scored.map((f, i) => ({ id: `F-${String(i + 1).padStart(2, '0')}`, ...f }));
}
