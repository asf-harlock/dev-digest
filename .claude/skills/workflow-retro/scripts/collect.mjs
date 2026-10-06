#!/usr/bin/env node
// Deterministic metrics for /workflow-retro: reads the Claude Code session
// transcript and its subagent transcripts, prints one JSON document.
// Usage: node collect.mjs [--session <id>] [--project-dir <dir>] [--out <dir>]
//                         [--from <ISO ts>] [--until <ISO ts>]
//   --from/--until keep only transcript lines inside that window (orchestrator
//   and agents alike), for a session that mixed the workflow with other work.
//   --out also writes metrics.json, reports/<agent>.md (each agent's final
//   report) and prompts/<agent>.md (launch prompt + resume messages) there, so
//   the analysis can open one agent at a time instead of whole transcripts.
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

// ~/.claude/projects/<cwd with / and . replaced by ->
const projectDir =
  opt('--project-dir') ??
  join(homedir(), '.claude', 'projects', process.cwd().replace(/[/.]/g, '-'));
if (!existsSync(projectDir)) fail(`no transcript dir ${projectDir}`);

let sessionId = opt('--session') ?? process.env.CLAUDE_CODE_SESSION_ID;
if (!sessionId) {
  const newest = readdirSync(projectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, t: statSync(join(projectDir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];
  if (!newest) fail('no session transcripts');
  sessionId = basename(newest.f, '.jsonl');
}
const mainFile = join(projectDir, `${sessionId}.jsonl`);
if (!existsSync(mainFile)) fail(`no transcript ${mainFile}`);

function fail(msg) {
  console.error(`workflow-retro: ${msg}`);
  process.exit(1);
}

const FROM = opt('--from') ? Date.parse(opt('--from')) : -Infinity;
const UNTIL = opt('--until') ? Date.parse(opt('--until')) : Infinity;
if (Number.isNaN(FROM) || Number.isNaN(UNTIL)) fail('--from/--until must be ISO timestamps');

function readJsonl(file) {
  const out = [];
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      // Lines without a timestamp are metadata; keep them.
      const t = e.timestamp ? Date.parse(e.timestamp) : undefined;
      if (t === undefined || (t >= FROM && t <= UNTIL)) out.push(e);
    } catch {
      // a line being written right now — skip it
    }
  }
  return out;
}

// A gap longer than this between two transcript lines is idle time (waiting
// for the user or for a resume), not work.
const IDLE_GAP_MS = 120_000;

// Paths a Bash command reads with cat/sed/head/tail/wc — heuristic, so the
// duplication check also sees reads done through the shell.
const SHELL_READ = /\b(?:cat|sed\s+-n\s+'[^']*'|sed\s+-n\s+\S+|head(?:\s+-\S+)*|tail(?:\s+-\S+)*|wc(?:\s+-\S+)*)\s+((?:[\w@./~-]+\.[A-Za-z]{1,6}\s*)+)/g;
function shellReads(cmd) {
  const out = [];
  // `cd <dir> && …` → paths are relative to <dir>
  const cd = String(cmd).match(/^\s*cd\s+(\S+)\s*&&/)?.[1];
  const base = cd && !cd.startsWith('~') ? `${cd.replace(/\/$/, '')}/` : '';
  for (const m of String(cmd).matchAll(SHELL_READ))
    for (const p of m[1].trim().split(/\s+/))
      if (!p.startsWith('-')) out.push(p.startsWith('/') ? p : `${base}${p}`);
  return out;
}

// Quality gates whose outcome says whether an agent's output held up.
const GATE =
  /lint-spec\.mjs|pnpm\s+(?:test|typecheck|lint|arch)\b|npm\s+(?:test|run\s+\w+)|vitest|\btsc\b|scripts\/check\.sh|scripts\/e2e\.sh|pr-self-review\/scripts\/\S+|eslint|depcruise/;
// A piped gate (`… | tail`) exits 0 even when it fails, so read the output too.
const GATE_FAIL_TEXT = /(^|\s)(FAIL|FAILED)\b|\b[1-9]\d* (?:failed|errors?)\b|error TS\d+|\b[1-9]\d* critical\b/i;

// The gate a command runs, looking only at what each `&&`/`;`/`|` segment
// executes — not at text inside a heredoc, a string or an argument.
function gateOf(cmd) {
  // Drop heredocs and quoted strings: `node -e '… && pnpm test …'` runs node,
  // not pnpm test.
  const body = String(cmd)
    .split('<<')[0]
    .replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''");
  for (const seg of body.split(/&&|\|\||;|\||\n/)) {
    const run = seg.trim().replace(/^(?:\w+=\S+\s+)*(?:node|bash|sh|npx|pnpm\s+exec)\s+/, '');
    const m = run.match(GATE);
    if (m && m.index === 0) return m[0].replace(/\s+/g, ' ');
    // `node .claude/…/lint-spec.mjs` → the path starts the segment
    const path = run.match(/^\S*?(lint-spec\.mjs|scripts\/check\.sh|scripts\/e2e\.sh|pr-self-review\/scripts\/\S+)/);
    if (path) return path[1];
  }
  return undefined;
}

function errorKind(text) {
  if (/Permission for this action was denied|denied by|was blocked/i.test(text)) return 'denied';
  if (/^Exit code \d+/.test(text)) return 'exit';
  if (/does not exist|No such file|ENOENT/i.test(text)) return 'missing-path';
  return 'other';
}

// Same file, whether read by absolute path, relative path or through Bash.
const CWD = `${process.cwd()}/`;
const norm = (p) => (String(p).startsWith(CWD) ? String(p).slice(CWD.length) : String(p)).replace(/^\.\//, '');

const trunc = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** One actor (orchestrator or subagent) → tokens, tools, errors, reads. */
function analyse(entries) {
  // Assistant messages are split into one line per content block, all sharing
  // message.id and repeating usage → keep the last usage per id.
  const usageById = new Map();
  const models = new Set();
  const tools = {};
  const toolCalls = [];
  const errors = [];
  const reads = {};
  const greps = [];
  let first;
  let last;
  let activeMs = 0;
  const segments = [];
  let lastText = '';
  const handbacks = [];
  const gates = [];
  for (const e of entries) {
    if (e.timestamp) {
      const t = Date.parse(e.timestamp);
      const seg = segments.at(-1);
      if (seg && t - seg.end <= IDLE_GAP_MS) {
        activeMs += Math.max(0, t - seg.end);
        seg.end = t;
      } else segments.push({ start: t, end: t });
      first ??= e.timestamp;
      last = e.timestamp;
    }
    const m = e.message ?? {};
    if (e.type === 'assistant') {
      if (m.model && m.model !== '<synthetic>') models.add(m.model);
      if (m.id && m.usage) usageById.set(m.id, { model: m.model, usage: m.usage });
      for (const c of m.content ?? []) {
        if (c.type === 'text' && c.text?.trim()) lastText = c.text;
        if (c.type !== 'tool_use') continue;
        tools[c.name] = (tools[c.name] ?? 0) + 1;
        toolCalls.push({ id: c.id, name: c.name, input: c.input, ts: e.timestamp });
        const p = c.input?.file_path;
        if (c.name === 'Read' && p) reads[norm(p)] = (reads[norm(p)] ?? 0) + 1;
        if (c.name === 'Grep' && c.input?.pattern) greps.push(c.input.pattern);
        if (c.name === 'Bash')
          for (const sp of shellReads(c.input?.command)) reads[norm(sp)] = (reads[norm(sp)] ?? 0) + 1;
        if (c.name === 'SubagentHandback') handbacks.push(c.input?.message ?? '');
      }
    }
    if (e.type === 'user' && Array.isArray(m.content)) {
      for (const c of m.content) {
        if (c.type !== 'tool_result') continue;
        const call = toolCalls.find((t) => t.id === c.tool_use_id);
        const text = String(
          Array.isArray(c.content) ? c.content.map((x) => x.text ?? '').join(' ') : (c.content ?? ''),
        );
        const cmd = call?.name === 'Bash' ? String(call.input?.command ?? '') : '';
        const gate = gateOf(cmd);
        if (gate)
          gates.push({
            gate,
            ts: e.timestamp,
            pass: !c.is_error && !GATE_FAIL_TEXT.test(text),
            cmd: trunc(cmd, 140),
            tail: trunc(text.slice(-300), 300),
          });
        if (!c.is_error) continue;
        errors.push({ tool: call?.name ?? '?', kind: errorKind(text), ts: e.timestamp, error: trunc(text, 200) });
      }
    }
  }
  const tokens = { input: 0, cache_write: 0, cache_read: 0, output: 0, thinking: 0, calls: 0 };
  const byModel = {};
  for (const { model, usage: u } of usageById.values()) {
    const row = (byModel[model] ??= { input: 0, cache_write: 0, cache_read: 0, output: 0, calls: 0 });
    for (const t of [tokens, row]) {
      t.input += u.input_tokens ?? 0;
      t.cache_write += u.cache_creation_input_tokens ?? 0;
      t.cache_read += u.cache_read_input_tokens ?? 0;
      t.output += u.output_tokens ?? 0;
      t.calls += 1;
    }
    tokens.thinking += u.output_tokens_details?.thinking_tokens ?? 0;
  }
  tokens.total = tokens.input + tokens.cache_write + tokens.cache_read + tokens.output;
  // Tokens not served from cache — the number that tracks real cost and effort.
  tokens.fresh = tokens.input + tokens.cache_write + tokens.output;
  const durationMs = first && last ? Date.parse(last) - Date.parse(first) : 0;
  return {
    models: [...models],
    first,
    last,
    durationMs,
    activeMs,
    segments,
    tokens,
    byModel,
    tools,
    toolCalls,
    errors,
    reads,
    greps,
    // Every hand-back, in order — a resumed agent reports once per phase.
    finalReport: handbacks.length
      ? handbacks.map((h, i) => `## Hand-back ${i + 1}\n\n${h}`).join('\n\n---\n\n')
      : lastText,
    handbacks: handbacks.length,
    gates,
  };
}

// ---------- orchestrator ----------
const mainEntries = readJsonl(mainFile);
const main = analyse(mainEntries);

// ---------- subagents ----------
const subDir = join(projectDir, sessionId, 'subagents');
const agents = [];
if (existsSync(subDir)) {
  for (const f of readdirSync(subDir).filter((x) => x.endsWith('.jsonl'))) {
    const id = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
    const metaFile = join(subDir, `agent-${id}.meta.json`);
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
    const a = analyse(readJsonl(join(subDir, f)));
    if (!a.first) continue; // no activity inside the --from/--until window
    agents.push({ id, meta, ...a });
  }
}

// Launch prompt + resumes come from the orchestrator's own tool calls.
const launchByToolUse = new Map(
  main.toolCalls.filter((t) => t.name === 'Agent').map((t) => [t.id, t]),
);
for (const a of agents) {
  const launch = launchByToolUse.get(a.meta.toolUseId);
  a.launchedAt = launch?.ts ?? a.first;
  a.prompt = launch?.input?.prompt ?? '';
  a.promptChars = launch ? a.prompt.length : null;
  a.resumeMessages = main.toolCalls
    .filter((t) => t.name === 'SendMessage' && (t.input?.to === a.id || t.input?.recipient === a.id))
    .map((t) => t.input?.message ?? '');
  a.requestedModel = launch?.input?.model ?? null;
  a.resumes = main.toolCalls.filter(
    (t) => t.name === 'SendMessage' && (t.input?.to === a.id || t.input?.recipient === a.id),
  ).length;
}
agents.sort((x, y) => Date.parse(x.launchedAt) - Date.parse(y.launchedAt));

// ---------- model fit ----------
// Flags, not verdicts: the rubric decides whether a flag is a real issue.
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'Skill', 'SubagentHandback', 'WebFetch', 'WebSearch']);
const freshAll = main.tokens.fresh + agents.reduce((s, a) => s + a.tokens.fresh, 0);
for (const a of agents) {
  const calls = Object.values(a.tools).reduce((s, n) => s + n, 0);
  const readCalls = Object.entries(a.tools)
    .filter(([t]) => READ_TOOLS.has(t))
    .reduce((s, [, n]) => s + n, 0);
  const writes = (a.tools.Write ?? 0) + (a.tools.Edit ?? 0);
  a.freshShare = +(a.tokens.fresh / Math.max(1, freshAll)).toFixed(2);
  a.readShare = +(readCalls / Math.max(1, calls)).toFixed(2);
  a.flags = [];
  const top = a.models.some((m) => /opus|fable/i.test(m));
  if (top && a.readShare >= 0.8)
    a.flags.push(`top-tier model, ${Math.round(a.readShare * 100)}% read-only tool calls, ${writes} writes — a cheaper model may do`);
  if (a.freshShare >= 0.5) a.flags.push(`${Math.round(a.freshShare * 100)}% of the run's fresh tokens`);
  if (a.errors.some((x) => x.kind === 'denied')) a.flags.push('hit a permission denial');
  if (a.resumes >= 2) a.flags.push(`${a.resumes} resumes`);
}

// ---------- outcome quality ----------
// Gate runs in order, per gate: first-try pass and how many runs it took.
const allGates = [
  ...main.gates.map((g) => ({ ...g, actor: 'orchestrator' })),
  ...agents.flatMap((a) => a.gates.map((g) => ({ ...g, actor: `${a.meta.agentType}:${a.id.slice(0, 7)}` }))),
].sort((x, y) => Date.parse(x.ts) - Date.parse(y.ts));
const gateSummary = {};
for (const g of allGates) {
  const row = (gateSummary[g.gate] ??= { runs: 0, fails: 0, firstTryPass: g.pass, finalPass: g.pass });
  row.runs += 1;
  if (!g.pass) row.fails += 1;
  row.finalPass = g.pass;
}

// /run-plan state touched during this session.
const sdd = [];
const sddDir = join(process.cwd(), '.claude', 'sdd');
if (existsSync(sddDir)) {
  for (const spec of readdirSync(sddDir)) {
    const stateFile = join(sddDir, spec, 'state.json');
    if (!existsSync(stateFile) || statSync(stateFile).mtimeMs < Date.parse(main.first)) continue;
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    const files = readdirSync(join(sddDir, spec));
    const verify = files
      .filter((f) => /^verify-\d+\.md$/.test(f))
      .sort()
      .map((f) => {
        const text = readFileSync(join(sddDir, spec, f), 'utf8');
        const count = (w) => (text.match(new RegExp(`\\|\\s*${w}\\s*\\|`, 'g')) ?? []).length;
        return { file: f, pass: count('Pass'), fail: count('Fail'), blocked: count('Blocked'), unverified: count('Unverified') };
      });
    const reviews = files
      .filter((f) => /^review-round-\d+\.json$/.test(f))
      .sort()
      .map((f) => {
        const r = JSON.parse(readFileSync(join(sddDir, spec, f), 'utf8'));
        const by = {};
        for (const x of r.findings ?? []) by[x.severity] = (by[x.severity] ?? 0) + 1;
        return { file: f, findings: (r.findings ?? []).length, bySeverity: by };
      });
    sdd.push({ spec, phase: state.phase, verify_rounds: state.verify_rounds, review_round: state.review_round, verify, reviews });
  }
}

// ---------- timeline ----------
const timeline = [];
for (const e of mainEntries) {
  if (e.type !== 'user' || e.isMeta) continue;
  const c = e.message?.content;
  const text =
    typeof c === 'string'
      ? c
      : Array.isArray(c)
        ? c.filter((x) => x.type === 'text').map((x) => x.text).join(' ')
        : '';
  if (!text.trim() || text.startsWith('<command-') || text.startsWith('<local-command')) continue;
  if (text.startsWith('<task-notification') || text.startsWith('<agent-message')) continue;
  timeline.push({ ts: e.timestamp, kind: 'user', text: trunc(text, 240) });
}
for (const t of main.toolCalls) {
  if (t.name === 'Agent')
    timeline.push({
      ts: t.ts,
      kind: 'launch',
      agent: t.input?.subagent_type ?? 'general-purpose',
      description: t.input?.description,
    });
  if (t.name === 'SendMessage')
    timeline.push({ ts: t.ts, kind: 'resume', to: t.input?.to, summary: t.input?.summary });
  if (['Skill', 'Workflow', 'AskUserQuestion'].includes(t.name))
    timeline.push({ ts: t.ts, kind: t.name.toLowerCase(), detail: trunc(JSON.stringify(t.input), 160) });
}
for (const a of agents)
  timeline.push({ ts: a.last, kind: 'agent-last-activity', agent: a.meta.agentType, id: a.id });
timeline.sort((x, y) => Date.parse(x.ts) - Date.parse(y.ts));

// ---------- parallelism ----------
// Counted over active segments only, so an agent idling between phases does
// not look concurrent with everything that ran meanwhile.
const edges = agents.flatMap((a) =>
  a.segments.flatMap((sg) => [
    { t: sg.start, d: 1 },
    { t: sg.end, d: -1 },
  ]),
);
edges.sort((x, y) => x.t - y.t || x.d - y.d);
let live = 0;
let maxParallel = 0;
for (const e of edges) maxParallel = Math.max(maxParallel, (live += e.d));

// ---------- duplication ----------
const actors = [{ name: 'orchestrator', reads: main.reads, greps: main.greps }].concat(
  agents.map((a) => ({ name: `${a.meta.agentType ?? 'agent'}:${a.id.slice(0, 7)}`, reads: a.reads, greps: a.greps })),
);
const readers = {};
for (const act of actors)
  for (const [p, n] of Object.entries(act.reads)) (readers[p] ??= []).push(`${act.name}×${n}`);
const sharedReads = Object.entries(readers)
  .filter(([, who]) => who.length > 1)
  .map(([path, who]) => ({ path, who }));
const rereads = actors.flatMap((act) =>
  Object.entries(act.reads)
    .filter(([, n]) => n > 1)
    .map(([path, n]) => ({ actor: act.name, path, n })),
);
const grepBy = {};
for (const act of actors) for (const g of new Set(act.greps)) (grepBy[g] ??= []).push(act.name);
const sharedGreps = Object.entries(grepBy)
  .filter(([, who]) => who.length > 1)
  .map(([pattern, who]) => ({ pattern, who }));

// ---------- topology ----------
// Structural candidates — merge, fold, split, concurrency, model — computed
// from the numbers above so a proposal can say "merge X with Y" or "lower
// concurrency 4 → 3" with a number behind it. Candidates, not verdicts: the
// rubric's Topology lens accepts or rejects each one with a reason.
const label = (a) => `${a.meta.agentType ?? 'agent'}:${a.id.slice(0, 7)}`;
const callsOf = (a) => Object.values(a.tools).reduce((s, n) => s + n, 0);
const liveAt = (t, self) =>
  agents.filter((a) => a !== self && a.segments.some((sg) => sg.start <= t && t <= sg.end)).length;
const topology = [];

// A verifier or reviewer must stay independent of what it checks, so it is
// only ever paired with another agent of its own type ("resume instead").
const isChecker = (a) =>
  /verifier|reviewer/.test(a.meta.agentType ?? '') || /\b(review|verify|re-?check)\b/i.test(a.meta.description ?? '');
const merges = [];
for (let i = 0; i < agents.length; i++)
  for (let j = i + 1; j < agents.length; j++) {
    const [a, b] = [agents[i], agents[j]];
    if (a.meta.agentType !== b.meta.agentType && (isChecker(a) || isChecker(b))) continue;
    const ra = Object.keys(a.reads);
    const rb = Object.keys(b.reads);
    if (ra.length < 3 || rb.length < 3) continue;
    const shared = ra.filter((p) => p in b.reads);
    const overlap = shared.length / Math.min(ra.length, rb.length);
    if (shared.length < 3 || overlap < 0.5) continue;
    const sameType = a.meta.agentType === b.meta.agentType;
    merges.push({
      kind: 'merge',
      agents: [label(a), label(b)],
      sharedFiles: shared.length,
      overlap: +overlap.toFixed(2),
      freshSecond: b.tokens.fresh,
      suggestion: sameType
        ? `resume ${label(a)} instead of launching ${label(b)} — same type, ${Math.round(overlap * 100)}% of the smaller read set shared`
        : `merge ${label(b)} into ${label(a)} (one agent, both briefs) — ${shared.length} files read by both`,
    });
  }
merges.sort((x, y) => y.overlap * y.sharedFiles - x.overlap * x.sharedFiles);
topology.push(...merges.slice(0, 8));

for (const a of agents) {
  const calls = callsOf(a);
  if (calls <= 6 && a.freshShare < 0.02)
    topology.push({
      kind: 'fold',
      agents: [label(a)],
      toolCalls: calls,
      fresh: a.tokens.fresh,
      suggestion: `fold ${label(a)} into the orchestrator or its neighbour — ${calls} tool calls, ${a.tokens.fresh} fresh tokens`,
    });
  if (a.resumes >= 3 || a.freshShare >= 0.3)
    topology.push({
      kind: 'split',
      agents: [label(a)],
      resumes: a.resumes,
      freshShare: a.freshShare,
      suggestion: `split ${label(a)} — a fresh agent per phase/layer, resume only for fixes (${a.resumes} resumes, ${Math.round(a.freshShare * 100)}% of fresh tokens)`,
    });
  const top = a.models.some((m) => /opus|fable/i.test(m));
  if (top && a.readShare >= 0.8)
    topology.push({
      kind: 'model',
      agents: [label(a)],
      from: a.models.join(', '),
      to: 'sonnet',
      readShare: a.readShare,
      suggestion: `run ${label(a)} on Sonnet for one comparable run — ${Math.round(a.readShare * 100)}% read-only calls`,
    });
  const failedGates = a.gates.filter((g) => !g.pass).length;
  if (!top && a.resumes >= 3 && failedGates >= 2)
    topology.push({
      kind: 'model',
      agents: [label(a)],
      from: a.models.join(', '),
      to: 'opus',
      resumes: a.resumes,
      failedGates,
      suggestion: `try ${label(a)} on Opus — ${a.resumes} resumes and ${failedGates} failed gates on a cheaper model`,
    });
}

// Failures (tool errors, failed gates) split by whether ≥ 2 other agents were
// active at that moment. Many failures under load and few alone → lower concurrency.
const failures = agents.flatMap((a) =>
  [...a.errors.map((x) => x.ts), ...a.gates.filter((g) => !g.pass).map((g) => g.ts)].map((ts) => ({
    a,
    load: liveAt(Date.parse(ts), a),
  })),
);
const underLoad = failures.filter((f) => f.load >= 2).length;
const alone = failures.length - underLoad;
let concurrency = null;
if (maxParallel >= 3 && underLoad >= 2 && underLoad > alone) {
  concurrency = { from: maxParallel, to: maxParallel - 1 };
  topology.push({
    kind: 'concurrency',
    ...concurrency,
    failuresUnderLoad: underLoad,
    failuresAlone: alone,
    suggestion: `lower concurrency ${maxParallel} → ${maxParallel - 1} — ${underLoad} failures with ≥ 2 other agents active vs ${alone} otherwise`,
  });
} else if (maxParallel <= 1 && agents.length >= 3) {
  concurrency = { from: maxParallel, to: 2 };
  topology.push({
    kind: 'concurrency',
    ...concurrency,
    suggestion: `raise concurrency ${maxParallel} → 2+ — ${agents.length} agents ran strictly one at a time; check which launches did not depend on the previous result`,
  });
}

// ---------- output ----------
const sum = (k) => main.tokens[k] + agents.reduce((s, a) => s + a.tokens[k], 0);
const slim = (a) => ({
  models: a.models,
  spanMin: +(a.durationMs / 60000).toFixed(1),
  activeMin: +(a.activeMs / 60000).toFixed(1),
  tokens: a.tokens,
  byModel: a.byModel,
  tools: a.tools,
  errors: a.errors,
  filesRead: Object.keys(a.reads).length,
});
const result = {
  session: {
    id: sessionId,
    transcript: mainFile,
    start: main.first,
    end: main.last,
    wallMin: +(main.durationMs / 60000).toFixed(1),
    window: opt('--from') || opt('--until') ? { from: opt('--from') ?? null, until: opt('--until') ?? null } : null,
  },
  totals: {
    agents: agents.length,
    maxParallel,
    tokens: {
      input: sum('input'),
      cache_write: sum('cache_write'),
      cache_read: sum('cache_read'),
      output: sum('output'),
      total: sum('total'),
      fresh: sum('fresh'),
    },
    orchestratorShareFresh: +(main.tokens.fresh / Math.max(1, sum('fresh'))).toFixed(2),
  },
  orchestrator: slim(main),
  agents: agents.map((a) => ({
    id: a.id,
    type: a.meta.agentType,
    description: a.meta.description,
    spawnDepth: a.meta.spawnDepth,
    background: a.meta.requestShape === 'background',
    launchedAt: a.launchedAt,
    requestedModel: a.requestedModel,
    promptChars: a.promptChars,
    resumes: a.resumes,
    reportChars: a.finalReport.length,
    handbacks: a.handbacks,
    freshShare: a.freshShare,
    readShare: a.readShare,
    flags: a.flags,
    ...slim(a),
  })),
  launchOrder: agents.map((a, i) => `${i + 1}. ${a.meta.agentType} — ${a.meta.description}`),
  timeline,
  duplication: { sharedReads, rereads, sharedGreps },
  topology,
  quality: {
    gates: gateSummary,
    gateRuns: allGates,
    sdd,
    resumes: agents.reduce((s, a) => s + a.resumes, 0),
    errorsByKind: [main, ...agents]
      .flatMap((a) => a.errors)
      .reduce((acc, x) => ({ ...acc, [x.kind]: (acc[x.kind] ?? 0) + 1 }), {}),
  },
};

const out = opt('--out');
// metrics.json is committed: the home directory becomes `~`.
const metricsText = () => JSON.stringify(result, null, 2).replaceAll(homedir(), '~');
if (out) {
  mkdirSync(join(out, 'reports'), { recursive: true });
  mkdirSync(join(out, 'prompts'), { recursive: true });
  writeFileSync(join(out, 'metrics.json'), metricsText());
  for (const a of agents)
    writeFileSync(
      join(out, 'reports', `${a.meta.agentType ?? 'agent'}-${a.id.slice(0, 7)}.md`),
      a.finalReport,
    );
  for (const a of agents)
    writeFileSync(
      join(out, 'prompts', `${a.meta.agentType ?? 'agent'}-${a.id.slice(0, 7)}.md`),
      [a.prompt, ...a.resumeMessages.map((m, i) => `\n\n---\n## Resume ${i + 1}\n\n${m}`)].join(''),
    );
}
// ---------- history ----------
// One row per retro in <out>/../history.jsonl; re-running the same retro
// replaces its row instead of adding a second one.
if (out) {
  const runName = basename(out);
  const histFile = join(dirname(out), 'history.jsonl');
  const row = {
    run: runName,
    session: sessionId,
    date: main.first?.slice(0, 10),
    agents: agents.length,
    agentTypes: agents.map((a) => a.meta.agentType),
    maxParallel,
    activeMin: +(main.activeMs / 60000).toFixed(1),
    spanMin: result.session.wallMin,
    freshTokens: result.totals.tokens.fresh,
    orchestratorShareFresh: result.totals.orchestratorShareFresh,
    byModelFresh: Object.fromEntries(
      [main, ...agents]
        .flatMap((a) => Object.entries(a.byModel))
        .reduce((m, [model, u]) => m.set(model, (m.get(model) ?? 0) + u.input + u.cache_write + u.output), new Map()),
    ),
    resumes: result.quality.resumes,
    errors: [main, ...agents].reduce((s, a) => s + a.errors.length, 0),
    gatesFirstTryPass: Object.values(gateSummary).filter((g) => g.firstTryPass).length,
    gates: Object.keys(gateSummary).length,
    flags: agents.flatMap((a) => a.flags.map((f) => `${a.meta.agentType}: ${f}`)),
    topology: topology.reduce((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {}),
  };
  const prev = existsSync(histFile)
    ? readFileSync(histFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const rows = prev.filter((r) => !(r.run === runName && r.session === sessionId)).concat(row);
  writeFileSync(histFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  result.history = { file: histFile, previous: rows.slice(0, -1).slice(-5) };
  writeFileSync(join(out, 'metrics.json'), metricsText());
}

console.log(JSON.stringify(result, null, 2));
