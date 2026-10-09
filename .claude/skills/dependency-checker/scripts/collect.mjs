#!/usr/bin/env node
// /dependency-checker — deterministic half of the skill.
// Reads lockfiles, node_modules and sources; writes metrics.json and a report.md
// whose three judgement blocks are placeholders. Read-only: never installs,
// updates or edits a package, a lockfile or a source file.
//
// Usage: node collect.mjs [--root <repo>] [--module a,b] [--top N]
//                         [--out <dir>] [--online] [--json] [--force]
import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectModule } from './lib/module.mjs';
import { buildFindings } from './lib/rules.mjs';
import { compareVendorCopies } from './lib/vendor.mjs';
import { collectOnline } from './lib/online.mjs';
import { renderReport, PENDING } from './lib/render.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
function fail(msg) {
  console.error(`dependency-checker: ${msg}`);
  process.exit(1);
}

// scripts/ -> dependency-checker/ -> skills/ -> .claude/ -> <repo>
const root = resolve(opt('--root') ?? fileURLToPath(new URL('../../../../', import.meta.url)));
const top = Number(opt('--top') ?? 15);
if (!Number.isInteger(top) || top < 1) fail('--top must be a positive integer');

// A module = a top-level directory with its own package.json. There is no root
// package.json in this repo, and none is ever created.
const IGNORE = new Set(['node_modules', 'dist', 'build']);
const all = readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !IGNORE.has(e.name))
  .map((e) => e.name)
  .filter((n) => existsSync(join(root, n, 'package.json')))
  .sort();
const wanted = opt('--module')?.split(',').map((s) => s.trim()).filter(Boolean);
const unknown = (wanted ?? []).filter((w) => !all.includes(w));
if (unknown.length) fail(`unknown module(s): ${unknown.join(', ')}. Found: ${all.join(', ') || 'none'}`);
const dirs = wanted ?? all;
if (!dirs.length) fail(`no module (directory with a package.json) under ${root}`);

const modules = dirs.map((d) => collectModule(root, d));
const vendorDrift = compareVendorCopies(root, all).filter((v) => v.modules.every((m) => dirs.includes(m)));

let online = null;
if (flag('--online')) online = collectOnline(modules);
const findings = buildFindings(modules, { vendorDrift }, online?.findings ?? []);

let head = 'unknown';
try {
  head = execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  /* not a git checkout */
}
const date = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
const metrics = {
  meta: {
    date, repo: basename(root), head, online: !!online, top,
    node: process.version, platform: `${process.platform}-${process.arch}`,
  },
  modules,
  vendorDrift,
  findings,
  online: online && { ran: online.ran, errors: online.errors },
};

const outDir = resolve(opt('--out') ?? join(root, '.claude', 'dependency-checker', date));
// A report whose judgement blocks are already written is work, not output: never overwrite it silently.
const existing = join(outDir, 'report.md');
if (existsSync(existing) && !readFileSync(existing, 'utf8').includes(PENDING) && !flag('--force')) {
  fail(`${existing} is already completed. Re-run with --force to overwrite it, or --out <dir> to write elsewhere.`);
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
writeFileSync(join(outDir, 'report.md'), renderReport(metrics, { top }));

if (flag('--json')) {
  process.stdout.write(JSON.stringify(metrics, null, 2));
} else {
  const sev = (s) => findings.filter((f) => f.severity === s).length;
  console.log(`dependency-checker: ${modules.length} module(s), ${findings.length} finding(s) ` +
    `(high ${sev('high')}, medium ${sev('medium')}, low ${sev('low')}, info ${sev('info')})`);
  console.log(`out: ${outDir}`);
}
