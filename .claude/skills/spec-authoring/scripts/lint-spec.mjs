#!/usr/bin/env node
// lint-spec.mjs — deterministic form check for SPEC-NN files.
// Rules: ../reference/template.md (everything marked "(lint)").
// Usage: node lint-spec.mjs <spec.md> [...]   → "path:line: message", exit 1 on any error.
// A file with no `Spec ID:` line is a legacy spec (specs/01–03) and is skipped.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SECTIONS = [
  'Проблема й користувач',
  'Goals / Non-goals',
  'User stories',
  'Acceptance criteria (EARS)',
  'Edge cases',
  'Non-functional requirements',
  'Inputs and provenance',
  'Untrusted inputs',
  'Open questions',
];

const PREFIX_BY_SECTION = {
  'User stories': 'US',
  'Acceptance criteria (EARS)': 'AC',
  'Edge cases': 'EC',
  'Non-functional requirements': 'NFR',
  'Untrusted inputs': 'UI',
  'Open questions': 'Q',
};
const SHALL_PREFIXES = new Set(['AC', 'EC', 'NFR', 'UI']);
const STATUSES = new Set(['draft', 'approved', 'implemented']);

const VAGUE = [
  'fast', 'quick', 'quickly', 'slow', 'easy', 'easily', 'simple', 'intuitive',
  'user-friendly', 'seamless', 'seamlessly', 'robust', 'efficient', 'efficiently',
  'properly', 'appropriate', 'appropriately', 'adequate', 'reasonable', 'should',
  'may', 'might', 'some', 'several', 'various',
];
const VAGUE_PHRASES = ['as needed', 'as appropriate', 'if possible', 'etc.', 'and/or'];
const VAGUE_RE = new RegExp(`(^|[^\\w-])(${VAGUE.map((w) => w.replace('-', '\\-')).join('|')})(?=$|[^\\w-])`, 'i');

const ITEM_RE = /^- (~~)?\*\*([A-Z]+)-(\d+)\*\*(~~)?(.*)$/;
const TRIGGER_RE = /^(КОЛИ|ПОКИ|ЯКЩО|ДЕ)\s|^The system\s/;

/** Returns [{ line, message }] for one spec's text. */
export function lintText(text, fileName = '') {
  const errors = [];
  const err = (line, message) => errors.push({ line, message });
  const raw = text.split('\n');

  // Blank out fenced code and HTML comments so they are never parsed as structure.
  const lines = [];
  let inFence = false;
  let inComment = false;
  for (const l of raw) {
    if (/^\s*```/.test(l)) { inFence = !inFence; lines.push(''); continue; }
    if (inFence) { lines.push(''); continue; }
    let s = l;
    if (inComment) {
      const end = s.indexOf('-->');
      if (end === -1) { lines.push(''); continue; }
      s = s.slice(end + 3); inComment = false;
    }
    s = s.replace(/<!--.*?-->/g, '');
    const open = s.indexOf('<!--');
    if (open !== -1) { s = s.slice(0, open); inComment = true; }
    lines.push(s);
  }

  if (!lines.some((l) => /^Spec ID:/.test(l))) return { skipped: true, errors: [] };

  // ---- title + header -------------------------------------------------------
  if (!/^# Spec: \S/.test(lines[0] ?? '')) err(1, 'line 1 must be "# Spec: <feature name>"');
  const firstH2 = lines.findIndex((l) => /^## /.test(l));
  const head = lines.slice(0, firstH2 === -1 ? lines.length : firstH2);
  const field = (name) => head.map((l, i) => [l, i]).filter(([l]) => l.startsWith(`${name}:`));

  const ids = field('Spec ID');
  if (ids.length !== 1) err(1, `header needs exactly one "Spec ID:" line, found ${ids.length}`);
  const idMatch = ids[0] && /^Spec ID: SPEC-(\d{2,})\s*$/.exec(ids[0][0]);
  if (ids[0] && !idMatch) err(ids[0][1] + 1, 'Spec ID must look like "Spec ID: SPEC-NN"');
  const filePrefix = /^(\d{2,})-/.exec(basename(fileName));
  if (idMatch && filePrefix && Number(idMatch[1]) !== Number(filePrefix[1])) {
    err(ids[0][1] + 1, `Spec ID SPEC-${idMatch[1]} does not match filename prefix ${filePrefix[1]}`);
  }
  const st = field('Status');
  if (st.length !== 1) err(1, `header needs exactly one "Status:" line, found ${st.length}`);
  else {
    const v = st[0][0].slice('Status:'.length).trim();
    if (!STATUSES.has(v)) err(st[0][1] + 1, `Status must be one of draft | approved | implemented, got "${v}"`);
  }
  const sup = field('Supersedes');
  if (sup.length !== 1) err(1, `header needs exactly one "Supersedes:" line, found ${sup.length}`);
  else if (!sup[0][0].slice('Supersedes:'.length).trim()) err(sup[0][1] + 1, 'Supersedes: needs a link or "—"');

  // ---- sections -------------------------------------------------------------
  const h2 = lines.map((l, i) => [l, i]).filter(([l]) => /^## /.test(l)).map(([l, i]) => ({ title: l.slice(3).trim(), i }));
  const titles = h2.map((h) => h.title);
  if (titles.join('\n') !== SECTIONS.join('\n')) {
    for (const h of h2) if (!SECTIONS.includes(h.title)) err(h.i + 1, `unexpected section "## ${h.title}"`);
    for (const s of SECTIONS) {
      const n = titles.filter((t) => t === s).length;
      if (n === 0) err(1, `missing section "## ${s}"`);
      if (n > 1) err(1, `section "## ${s}" appears ${n} times`);
    }
    const known = titles.filter((t) => SECTIONS.includes(t));
    const expected = SECTIONS.filter((s) => known.includes(s));
    if (known.join('\n') !== expected.join('\n')) err(1, `sections out of order — expected: ${SECTIONS.join(' → ')}`);
  }

  const sections = h2.map((h, k) => ({ ...h, end: k + 1 < h2.length ? h2[k + 1].i : lines.length }));
  const items = [];
  for (const sec of sections) {
    const body = lines.slice(sec.i + 1, sec.end);
    if (!body.some((l) => l.trim())) err(sec.i + 1, `section "## ${sec.title}" is empty — write "None — <why>" if nothing applies`);
    const want = PREFIX_BY_SECTION[sec.title];

    for (let j = sec.i + 1; j < sec.end; j++) {
      const l = lines[j];
      const m = ITEM_RE.exec(l);
      if (!m) {
        if (want && /^- /.test(l)) err(j + 1, `list item in "## ${sec.title}" must start with **${want}-n**`);
        continue;
      }
      const [, s1, prefix, num, s2, rest] = m;
      let full = rest;
      let k = j + 1;
      while (k < sec.end && /^\s+\S/.test(lines[k])) { full += ` ${lines[k].trim()}`; k++; }
      const item = { id: `${prefix}-${num}`, prefix, line: j + 1, text: full.trim(), struck: Boolean(s1 || s2), section: sec.title };
      items.push(item);
      if (prefix !== want) err(j + 1, `${item.id} does not belong in "## ${sec.title}"${want ? ` (expected ${want}-n)` : ''}`);
    }

    if (sec.title === 'Untrusted inputs') {
      const text = body.join('\n').trim();
      const hasItem = items.some((it) => it.section === sec.title);
      if (!hasItem && text && !/^None — \S/.test(text)) err(sec.i + 1, 'Untrusted inputs needs UI-n items or "None — <why>"');
    }
  }

  // ---- items ----------------------------------------------------------------
  const seen = new Map();
  for (const it of items) {
    if (seen.has(it.id)) err(it.line, `${it.id} is duplicated (first at line ${seen.get(it.id)})`);
    else seen.set(it.id, it.line);
  }
  const stories = new Set(items.filter((it) => it.prefix === 'US').map((it) => it.id));
  const referenced = new Set();

  for (const it of items) {
    if (it.struck) continue;
    let text = it.text;
    if (it.prefix === 'AC') {
      const ref = /^\((US-\d+(?:,\s*US-\d+)*)\)\s*/.exec(text);
      if (!ref) err(it.line, `${it.id} must name the story it serves: "(US-n)" right after the ID`);
      else {
        for (const r of ref[1].split(/,\s*/)) {
          if (!stories.has(r)) err(it.line, `${it.id} references ${r}, which does not exist`);
          referenced.add(r);
        }
        text = text.slice(ref[0].length);
      }
      if (!TRIGGER_RE.test(text)) err(it.line, `${it.id} must start with КОЛИ / ПОКИ / ЯКЩО / ДЕ or "The system"`);
      if (/^ЯКЩО\s/.test(text) && !/ТОДІ/.test(text)) err(it.line, `${it.id} uses ЯКЩО without ТОДІ`);
    }
    if (it.prefix === 'EC' && !(/ЯКЩО/.test(text) && /ТОДІ/.test(text))) {
      err(it.line, `${it.id} must be "ЯКЩО <condition>, ТОДІ the system (shall) …"`);
    }
    if (SHALL_PREFIXES.has(it.prefix)) {
      const n = (text.match(/\(shall\)/g) ?? []).length;
      if (n !== 1) err(it.line, `${it.id} needs exactly one "(shall)", found ${n}${n > 1 ? ' — split it' : ''}`);
      const prose = text.replace(/`[^`]*`/g, '');
      const w = VAGUE_RE.exec(prose);
      if (w) err(it.line, `${it.id} uses the vague word "${w[2]}" — give a number, state or visible result`);
      const p = VAGUE_PHRASES.find((ph) => prose.toLowerCase().includes(ph));
      if (p) err(it.line, `${it.id} uses the vague phrase "${p}"`);
    }
    if (it.prefix === 'Q' && !/default:/.test(text)) err(it.line, `${it.id} needs a "default:" answer`);
  }
  for (const it of items) {
    if (it.prefix === 'US' && !it.struck && !referenced.has(it.id)) err(it.line, `${it.id} is not served by any AC`);
  }

  return { skipped: false, errors: errors.sort((a, b) => a.line - b.line) };
}

function main(paths) {
  if (paths.length === 0) {
    console.error('usage: lint-spec.mjs <spec.md> [...]');
    return 2;
  }
  let failed = false;
  for (const p of paths) {
    const { skipped, errors } = lintText(readFileSync(p, 'utf8'), p);
    if (skipped) { console.log(`${p}: skipped (legacy format — no "Spec ID:" line)`); continue; }
    for (const e of errors) console.log(`${p}:${e.line}: ${e.message}`);
    if (errors.length) failed = true;
    else console.log(`${p}: ok`);
  }
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)));
}
