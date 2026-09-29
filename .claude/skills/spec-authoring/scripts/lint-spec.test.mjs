// node --test .claude/skills/spec-authoring/scripts/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lintText, SECTIONS } from './lint-spec.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const messages = (text, name = '04-x.md') => lintText(text, name).errors.map((e) => e.message);

const body = {
  'Проблема й користувач': 'A reviewer cannot see X.',
  'Goals / Non-goals': '- Goal: show X.',
  'User stories': '- **US-1** As a developer, I want X, so that Y.',
  'Acceptance criteria (EARS)': '- **AC-1** (US-1) КОЛИ the user opens the PR, the system (shall) show X.',
  'Edge cases': '- **EC-1** ЯКЩО X is missing, ТОДІ the system (shall) render `—`.',
  'Non-functional requirements': '- **NFR-1** The system (shall) render X within 1 s.',
  'Inputs and provenance': '| Value | Source |\n|---|---|\n| X | `agent_runs.x` |',
  'Untrusted inputs': 'None — X is numeric.',
  'Open questions': '- **Q-1** Sum or latest? — default: latest — owner: user.',
};
const spec = (over = {}, header = 'Spec ID: SPEC-04\nStatus: draft\nSupersedes: —') =>
  `# Spec: X\n${header}\n\n` +
  SECTIONS.map((s) => (s in over && over[s] === null ? '' : `## ${s}\n\n${over[s] ?? body[s]}\n`)).join('\n');

test('a well-formed spec passes', () => {
  assert.deepEqual(messages(spec()), []);
});

test('the worked example in reference/ passes', () => {
  const text = readFileSync(here('../reference/example-spec.md'), 'utf8');
  assert.deepEqual(lintText(text, 'example-spec.md').errors, []);
});

test('a legacy spec without Spec ID is skipped', () => {
  const r = lintText('# Run Cost\n\n**Status:** agreed\n', '01-run-cost.md');
  assert.equal(r.skipped, true);
});

test('header: bad status and filename mismatch', () => {
  const m = messages(spec({}, 'Spec ID: SPEC-05\nStatus: agreed\nSupersedes: —'));
  assert.ok(m.some((x) => x.includes('does not match filename prefix 04')));
  assert.ok(m.some((x) => x.includes('Status must be one of')));
});

test('sections: missing and extra headings', () => {
  const m = messages(spec({ 'Edge cases': null }) + '\n## Design\n\ntext\n');
  assert.ok(m.some((x) => x.includes('missing section "## Edge cases"')));
  assert.ok(m.some((x) => x.includes('unexpected section "## Design"')));
});

test('AC: needs a story ref, a trigger and one (shall)', () => {
  const m = messages(spec({ 'Acceptance criteria (EARS)': '- **AC-1** Show X and (shall) log it (shall).' }));
  assert.ok(m.some((x) => x.includes('must name the story')));
  assert.ok(m.some((x) => x.includes('must start with КОЛИ')));
  assert.ok(m.some((x) => x.includes('exactly one "(shall)"')));
  assert.ok(m.some((x) => x.includes('US-1 is not served by any AC')));
});

test('AC: dangling story reference', () => {
  const m = messages(spec({ 'Acceptance criteria (EARS)': '- **AC-1** (US-1, US-9) КОЛИ X, the system (shall) show Y.' }));
  assert.ok(m.some((x) => x.includes('references US-9')));
});

test('EC must use ЯКЩО … ТОДІ', () => {
  const m = messages(spec({ 'Edge cases': '- **EC-1** КОЛИ X, the system (shall) show Y.' }));
  assert.ok(m.some((x) => x.includes('EC-1 must be "ЯКЩО')));
});

test('vague words are flagged, but not inside backticks', () => {
  const m = messages(spec({ 'Non-functional requirements': '- **NFR-1** The system (shall) load fast.' }));
  assert.ok(m.some((x) => x.includes('vague word "fast"')));
  assert.deepEqual(messages(spec({ 'Non-functional requirements': '- **NFR-1** The system (shall) set `fast` to 1.' })), []);
});

test('IDs: duplicate, wrong section, list item without ID', () => {
  const m = messages(spec({
    'Edge cases': '- **EC-1** ЯКЩО A, ТОДІ the system (shall) do B.\n- **EC-1** ЯКЩО C, ТОДІ the system (shall) do D.\n- **AC-7** (US-1) КОЛИ E, the system (shall) do F.\n- plain bullet',
  }));
  assert.ok(m.some((x) => x.includes('EC-1 is duplicated')));
  assert.ok(m.some((x) => x.includes('AC-7 does not belong')));
  assert.ok(m.some((x) => x.includes('must start with **EC-n**')));
});

test('struck items keep their ID but skip content rules', () => {
  const ac = '- **AC-1** (US-1) КОЛИ X, the system (shall) show Y.\n- ~~**AC-2**~~ Dropped 2026-10-02 — merged into AC-1.';
  assert.deepEqual(messages(spec({ 'Acceptance criteria (EARS)': ac })), []);
});

test('empty section, Untrusted inputs without items or None, Q without default', () => {
  const m = messages(spec({ 'Inputs and provenance': '', 'Untrusted inputs': 'Nothing here.', 'Open questions': '- **Q-1** Sum or latest?' }));
  assert.ok(m.some((x) => x.includes('"## Inputs and provenance" is empty')));
  assert.ok(m.some((x) => x.includes('Untrusted inputs needs UI-n items')));
  assert.ok(m.some((x) => x.includes('Q-1 needs a "default:"')));
});

test('continuation lines belong to the item', () => {
  const ac = '- **AC-1** (US-1) КОЛИ the user opens the PR,\n  the system (shall) show X.';
  assert.deepEqual(messages(spec({ 'Acceptance criteria (EARS)': ac })), []);
});
