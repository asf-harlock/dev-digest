// Opt-in registry checks (`--online`). The only code in this skill that talks to
// the network — and it does so only through the module's own package manager
// (`audit`, `outdated`), which sends package names and versions to the registry
// the repo is already configured for. Both commands exit non-zero when they
// find something, so the exit code is ignored and stdout is parsed.

import { spawnSync } from 'node:child_process';
import { major } from './format.mjs';

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  return r.stdout ?? '';
}

function json(text, what) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${what}: output was not JSON`);
  }
}

const SEV = { critical: 'high', high: 'high', moderate: 'medium', low: 'low', info: 'info' };

export function parsePnpmAudit(j, dir = '?') {
  const out = [];
  for (const a of Object.values(j.advisories ?? {})) {
    out.push({ name: a.module_name, severity: SEV[a.severity] ?? 'low', title: a.title, range: a.vulnerable_versions, patched: a.patched_versions });
  }
  if (!j.advisories && !j.metadata) throw new Error(`pnpm audit (${dir}): unrecognised JSON shape`);
  return out;
}

export function parseNpmAudit(j, dir = '?') {
  if (!j.vulnerabilities && !j.metadata) throw new Error(`npm audit (${dir}): unrecognised JSON shape`);
  return Object.entries(j.vulnerabilities ?? {}).map(([name, v]) => ({
    name,
    severity: SEV[v.severity] ?? 'low',
    title: v.via.filter((x) => typeof x === 'object').map((x) => x.title).slice(0, 2).join('; ') || 'transitive via ' + v.via.join(', '),
    range: v.range,
    patched: v.fixAvailable && typeof v.fixAvailable === 'object' ? `${v.fixAvailable.name}@${v.fixAvailable.version}` : v.fixAvailable ? 'fix available' : 'no fix',
  }));
}

const auditPnpm = (dir) => parsePnpmAudit(json(run('pnpm', ['--dir', dir, 'audit', '--json']), `pnpm audit (${dir})`), dir);
const auditNpm = (dir) => parseNpmAudit(json(run('npm', ['--prefix', dir, 'audit', '--json']), `npm audit (${dir})`), dir);

function outdated(pm, dir) {
  const text = pm === 'pnpm' ? run('pnpm', ['--dir', dir, 'outdated', '--format', 'json']) : run('npm', ['--prefix', dir, 'outdated', '--json']);
  if (!text.trim()) return {};
  return json(text, `${pm} outdated (${dir})`);
}

export function advisoryFindings(m, advisories) {
  const direct = new Map(m.directs.map((d) => [d.name, d]));
  return advisories.map((a) => {
    const d = direct.get(a.name);
    return {
      rule: 'VULN', severity: a.severity, module: m.dir, package: a.name, prod: !!d && d.kind !== 'dev',
      confidence: 'certain', bytes: null,
      title: `${m.dir}: ${a.name} has a known vulnerability (${a.severity})`,
      evidence: `${a.title}. Vulnerable: ${a.range ?? 'n/a'}; patched: ${a.patched ?? 'n/a'}.${d ? '' : ' Transitive — not declared directly.'}`,
      fix: d ? `Update ${a.name} within its range, or bump the specifier.` : 'Update the direct dependency that pulls it in, or add an override/resolution.',
    };
  });
}

export function outdatedFindings(m, rows) {
  const direct = new Map(m.directs.map((d) => [d.name, d]));
  const out = [];
  for (const [name, o] of Object.entries(rows)) {
    const d = direct.get(name);
    if (!d) continue;
    if (o.isDeprecated) {
      out.push({
        rule: 'DEPRECATED', severity: 'medium', module: m.dir, package: name, prod: d.kind !== 'dev', confidence: 'certain', bytes: null,
        title: `${m.dir}: ${name} is deprecated`, evidence: `${name}@${o.current} is marked deprecated on the registry (latest ${o.latest}).`,
        fix: 'Find the maintained replacement the deprecation message points to.',
      });
    } else if (major(o.latest) != null && major(o.current) != null && major(o.latest) > major(o.current)) {
      out.push({
        rule: 'OUTDATED', severity: 'low', module: m.dir, package: name, prod: d.kind !== 'dev', confidence: 'certain', bytes: null,
        title: `${m.dir}: ${name} is ${major(o.latest) - major(o.current)} major version(s) behind`,
        evidence: `current ${o.current}, wanted ${o.wanted}, latest ${o.latest}.`,
        fix: 'Read the changelog for breaking changes before bumping the major.',
      });
    }
  }
  return out;
}

export function collectOnline(modules) {
  const findings = [];
  const ran = new Set();
  const errors = [];
  for (const m of modules) {
    if (m.pm !== 'pnpm' && m.pm !== 'npm') continue;
    try {
      findings.push(...advisoryFindings(m, m.pm === 'pnpm' ? auditPnpm(m.dir) : auditNpm(m.dir)));
      ran.add('audit');
    } catch (e) {
      errors.push(e.message);
    }
    try {
      findings.push(...outdatedFindings(m, outdated(m.pm, m.dir)));
      ran.add('outdated');
    } catch (e) {
      errors.push(e.message);
    }
  }
  return { findings, ran: [...ran], errors };
}
