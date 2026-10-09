#!/usr/bin/env node
// Lint for a finished dependency report — the form check, like `spec:lint`.
// Proves the agent's three judgement blocks are filled in and traceable to the
// script's findings. It does NOT prove the advice is right.
//
// Usage: node check-report.mjs <dir containing report.md + metrics.json>
// Errors print as `report.md:LINE: message`; exit 1 on any error.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { JUDGEMENT_BLOCKS, PENDING, SECTION_HEADINGS } from './lib/render.mjs';

export function checkReport(reportText, metrics) {
  const errors = [];
  const lines = reportText.split('\n');
  const lineOf = (needle) => Math.max(1, lines.findIndex((l) => l.includes(needle)) + 1);
  const err = (line, msg) => errors.push({ line, msg });

  const known = new Map(metrics.findings.map((f) => [f.id, f]));
  const blocks = {};

  for (const name of JUDGEMENT_BLOCKS) {
    const re = new RegExp(`<!-- judgement:${name} -->\\n([\\s\\S]*?)\\n<!-- /judgement:${name} -->`);
    const m = re.exec(reportText);
    if (!m) {
      err(1, `judgement block "${name}" is missing or its markers were damaged`);
      continue;
    }
    const body = m[1].trim();
    const line = lineOf(`<!-- judgement:${name} -->`);
    if (!body || body === PENDING) err(line, `judgement block "${name}" is still empty`);
    blocks[name] = { body, line };
  }

  // The report has exactly the five contract sections, in order, and ends with Summary.
  const h2 = lines.map((l, i) => ({ l, i })).filter((x) => /^## /.test(x.l)).map((x) => ({ name: x.l.slice(3).trim(), line: x.i + 1 }));
  const names = h2.map((x) => x.name);
  for (const want of SECTION_HEADINGS) {
    if (!names.includes(want)) err(1, `missing section "## ${want}"`);
  }
  const order = SECTION_HEADINGS.filter((w) => names.includes(w));
  if (order.join('|') !== names.filter((n) => SECTION_HEADINGS.includes(n)).join('|')) {
    err(1, `sections are out of order — expected ${SECTION_HEADINGS.join(' → ')}`);
  }
  if (names.length && names[names.length - 1] !== 'Summary') {
    err(h2[h2.length - 1].line, 'the report must END with the "## Summary" section');
  }

  // Every finding id cited anywhere in a judgement block must exist.
  for (const [name, b] of Object.entries(blocks)) {
    for (const id of new Set(b.body.match(/\bF-\d{2,}\b/g) ?? [])) {
      if (!known.has(id)) err(b.line, `"${name}" cites ${id}, which is not in metrics.json`);
    }
  }

  // Every high finding must be addressed: scheduled in priorities, or dismissed with a reason.
  const pri = blocks.priorities?.body ?? '';
  for (const f of metrics.findings.filter((x) => x.severity === 'high')) {
    if (!pri.includes(f.id)) {
      err(blocks.priorities?.line ?? 1, `${f.id} (high, ${f.rule}) is not addressed in priorities — schedule it, or list it under Info with a reason`);
    }
  }

  // Priorities: all four tiers, each present (write "none" under an empty one).
  if (pri) {
    for (const tier of ['P0', 'P1', 'P2', 'Info']) {
      if (!new RegExp(`^#{3,5}\\s*${tier}\\b`, 'm').test(pri)) {
        err(blocks.priorities.line, `priorities has no "#### ${tier}" heading (write "none" under a tier with nothing in it)`);
      }
    }
  }

  // Summary: 3-5 numbered takeaways, ordered by priority (the order is the author's; the count is checked).
  const sum = blocks.summary?.body ?? '';
  if (sum) {
    const n = (sum.match(/^\s*\d+[.)]\s+\S/gm) ?? []).length;
    if (n < 3 || n > 5) err(blocks.summary.line, `summary must give 3-5 numbered takeaways, found ${n}`);
  }

  // Numbers in judgement text must come from the report, not from memory:
  // any "<n> MB/GB" figure has to appear somewhere in the generated tables too.
  const generated = reportText.replace(/<!-- judgement:[\s\S]*?<!-- \/judgement:[a-z]+ -->/g, '');
  for (const [name, b] of Object.entries(blocks)) {
    for (const fig of new Set(b.body.match(/\b\d+(?:\.\d+)?\s?(?:KB|MB|GB)\b/g) ?? [])) {
      const norm = fig.replace(/\s+/, ' ');
      if (!generated.includes(norm)) err(b.line, `"${name}" quotes ${fig}, which appears nowhere in the generated sections — copy figures, do not compute them`);
    }
  }
  return errors;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: check-report.mjs <dir with report.md + metrics.json>');
    process.exit(2);
  }
  const reportFile = join(dir, 'report.md');
  const metricsFile = join(dir, 'metrics.json');
  if (!existsSync(reportFile) || !existsSync(metricsFile)) {
    console.error(`check-report: need ${reportFile} and ${metricsFile}`);
    process.exit(2);
  }
  const errors = checkReport(readFileSync(reportFile, 'utf8'), JSON.parse(readFileSync(metricsFile, 'utf8')));
  for (const e of errors) console.log(`report.md:${e.line}: ${e.msg}`);
  console.log(errors.length ? `check-report: ${errors.length} error(s)` : 'check-report: ok');
  process.exit(errors.length ? 1 : 0);
}
