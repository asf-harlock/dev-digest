#!/usr/bin/env node
// Writes one row per pull request into .claude/workflow-retro/ci-review-ledger.jsonl.
//
// Every number is read, never typed in: timings and the check result from GitHub (`gh`), cost,
// review time and tokens from the `devdigest-result` artifact the CI runner uploads, and — with
// --studio — conflicts between agents from the studio's multi-agent run. A figure that could not
// be measured is `null` with a reason next to it, never a guess.
//
//   node scripts/ci-review-ledger.mjs --pr 31:pass --pr 32:critical
//   node scripts/ci-review-ledger.mjs --pr 32:critical --studio http://localhost:3001 --studio-run \
//        --agents "Security Reviewer,API Contract Reviewer"
//   node scripts/ci-review-ledger.mjs --build-metrics path/to/metrics.json   # a /workflow-retro metrics.json
//
// Needs: `gh` logged in, Node >= 22. Field meanings: .claude/workflow-retro/ci-review-ledger.md

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const WORKFLOW = 'DevDigest Review';
const ARTIFACT = 'devdigest-result';
const STUDIO_POLL_MS = 3000;
const STUDIO_TIMEOUT_MS = 180_000;
const EMPTY_DIFF = /Diff ready — 0 changed file/;

const args = process.argv.slice(2);
const opt = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));
const flag = (name) => args.includes(`--${name}`);

const out = opt('out')[0] ?? '.claude/workflow-retro/ci-review-ledger.jsonl';
const studio = opt('studio')[0] ?? null;
const agentNames = (opt('agents')[0] ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function sh(cmd, argv) {
  return execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
const gh = (argv) => sh('gh', argv);
const ghJson = (argv) => JSON.parse(gh(argv));

function repoFromOrigin() {
  const url = sh('git', ['remote', 'get-url', 'origin']).trim();
  const m = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!m) throw new Error(`cannot read owner/name from origin: ${url}`);
  return m[1];
}
const repo = opt('repo')[0] ?? repoFromOrigin();

const seconds = (from, to) => (from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 100) / 10 : null);

async function studioJson(path, init) {
  const res = await fetch(`${studio}${path}`, init);
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} -> ${res.status}`);
  return res.json();
}

/** Conflicts between agents (SPEC-11) for one PR, from the studio. Null-with-reason when unmeasurable. */
async function studioConflicts(prNumber) {
  if (!studio) return { measured: false, reason: 'no --studio given' };
  try {
    const repos = await studioJson('/repos');
    const repoRow = repos.find((r) => (r.full_name ?? r.name) === repo);
    if (!repoRow) return { measured: false, reason: `repo ${repo} is not registered in the studio` };
    const pr = await studioJson(`/repos/${repoRow.id}/pulls/lookup?number=${prNumber}`);

    if (flag('studio-run')) {
      const agents = await studioJson('/agents');
      const chosen = agents.filter((a) => (agentNames.length ? agentNames.includes(a.name) : a.enabled));
      if (chosen.length < 2) return { measured: false, reason: 'fewer than 2 agents selected' };
      await studioJson(`/pulls/${pr.id}/multi-agent-run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentIds: chosen.map((a) => a.id) }),
      });
    }

    const deadline = Date.now() + STUDIO_TIMEOUT_MS;
    let snap;
    for (;;) {
      snap = await studioJson(`/pulls/${pr.id}/multi-agent`);
      if (!snap.columns.some((c) => c.status === 'running')) break;
      if (Date.now() > deadline) return { measured: false, reason: 'multi-agent run still running after timeout' };
      await new Promise((r) => setTimeout(r, STUDIO_POLL_MS));
    }

    // A column is only evidence if its agent actually saw the diff.
    const agents = [];
    for (const c of snap.columns) {
      const run = await studioJson(`/runs/${c.run_id}`);
      const traceRes = await fetch(`${studio}/runs/${c.run_id}/trace`);
      const trace = traceRes.ok ? await traceRes.text() : null;
      agents.push({
        name: c.agent_name,
        status: c.status,
        duration_ms: c.duration_ms,
        cost_usd: c.cost_usd,
        tokens_in: run.tokens_in ?? null,
        tokens_out: run.tokens_out ?? null,
        findings: c.findings.length,
        // null = the trace could not be read: unknown, and treated as "not proven" below.
        saw_diff: trace === null ? null : !EMPTY_DIFF.test(trace),
      });
    }
    const done = agents.filter((a) => a.status === 'done');
    if (done.length < 2) return { measured: false, reason: 'fewer than 2 agents finished', run_id: snap.id, agents };
    if (done.some((a) => a.saw_diff === null)) {
      return { measured: false, reason: 'a run trace could not be read, so it is unproven that the agent saw the diff', run_id: snap.id, agents };
    }
    if (done.some((a) => a.saw_diff === false)) {
      return { measured: false, reason: 'an agent reviewed an empty diff (studio clone lacks the PR head; fetch it and re-run)', run_id: snap.id, agents };
    }
    return {
      measured: true,
      run_id: snap.id,
      groups: snap.conflicts.length,
      contended: snap.conflicts.filter((c) => c.contended).length,
      total_cost_usd: snap.total_cost_usd,
      total_duration_ms: snap.total_duration_ms,
      agents,
    };
  } catch (err) {
    return { measured: false, reason: `studio: ${err.message}` };
  }
}

/** The artifact comes from a workflow run of the PR's own branch: check it before it becomes a committed number. */
const isCount = (v) => Number.isInteger(v) && v >= 0 && v < 1e9;
function checkArtifact(a) {
  if (!a || typeof a !== 'object') return 'artifact is not an object';
  const counts = ['findings_count', 'duration_ms'];
  for (const k of counts) if (!isCount(a[k])) return `artifact field ${k} is not a plausible count`;
  for (const k of ['critical', 'warning', 'suggestion', 'tokens_in', 'tokens_out']) {
    if (a[k] != null && !isCount(a[k])) return `artifact field ${k} is not a plausible count`;
  }
  if (a.cost_usd != null && !(Number.isFinite(a.cost_usd) && a.cost_usd >= 0 && a.cost_usd < 1000)) {
    return 'artifact field cost_usd is not a plausible amount';
  }
  return null;
}

async function prRow(spec) {
  const [num, kind = null] = spec.split(':');
  const n = Number(num);
  const pr = ghJson(['pr', 'view', String(n), '-R', repo, '--json', 'number,url,title,createdAt,headRefOid,mergeStateStatus,state']);
  const runs = ghJson(['run', 'list', '-R', repo, '--workflow', WORKFLOW, '--commit', pr.headRefOid, '--json', 'databaseId,attempt,url', '-L', '1']);
  const base = { type: 'ci-review', pr: n, kind, url: pr.url, title: pr.title, head_sha: pr.headRefOid };
  if (!runs[0]) return { ...base, review: null, note: 'no workflow run for this head commit' };

  const run = ghJson(['run', 'view', String(runs[0].databaseId), '-R', repo, '--json', 'jobs,attempt,url']);
  const job = run.jobs[0];
  if (!job || job.status !== 'completed' || !job.completedAt || !job.conclusion) {
    throw new Error(`PR #${n}: the review job has not finished (status ${job?.status ?? 'missing'}); record it after the check completes`);
  }

  let artifact = null;
  let artifactNote = null;
  const dir = mkdtempSync(join(tmpdir(), 'ci-ledger-'));
  try {
    gh(['run', 'download', String(runs[0].databaseId), '-R', repo, '-n', ARTIFACT, '-D', dir]);
    artifact = JSON.parse(readFileSync(join(dir, 'devdigest-result.json'), 'utf8'));
    artifactNote = checkArtifact(artifact);
    if (artifactNote) artifact = null;
  } catch {
    artifactNote = 'no readable devdigest-result artifact (the runner failed before writing it, or it expired)';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return {
    ...base,
    run_id: runs[0].databaseId,
    run_url: run.url,
    run_attempt: run.attempt,
    review_check: job?.conclusion ?? null,
    merge_state: pr.mergeStateStatus,
    pr_opened_at: pr.createdAt,
    job_started_at: job?.startedAt ?? null,
    job_completed_at: job?.completedAt ?? null,
    queue_s: seconds(pr.createdAt, job?.startedAt),
    job_s: seconds(job?.startedAt, job?.completedAt),
    wall_clock_s: seconds(pr.createdAt, job?.completedAt),
    review_ms: artifact?.duration_ms ?? null,
    cost_usd: artifact?.cost_usd ?? null,
    tokens_in: artifact?.tokens_in ?? null,
    tokens_out: artifact?.tokens_out ?? null,
    findings: artifact
      ? { total: artifact.findings_count, critical: artifact.critical ?? null, warning: artifact.warning ?? null, suggestion: artifact.suggestion ?? null }
      : null,
    agent: artifact?.agent ?? null,
    runner_version: artifact?.version ?? null,
    artifact_note: artifactNote,
    conflicts: await studioConflicts(n),
    recorded_at: new Date().toISOString(),
  };
}

function buildRow(file) {
  const m = JSON.parse(readFileSync(file, 'utf8'));
  return {
    type: 'build',
    session: m.session.id,
    start: m.session.start,
    end: m.session.end,
    wall_min: m.session.wallMin,
    active_min: m.orchestrator?.activeMin ?? null,
    agents: m.totals.agents,
    tokens: m.totals.tokens, // input, cache_write, cache_read, output, total, fresh
    note: 'tokens.fresh = input + cache_write + output; cache_read is reported separately',
    recorded_at: new Date().toISOString(),
  };
}

const rows = [];
for (const spec of opt('pr')) rows.push(await prRow(spec));
for (const file of opt('build-metrics')) rows.push(buildRow(file));
if (rows.length === 0) {
  console.error('nothing to record: pass --pr <number>[:kind] and/or --build-metrics <file>');
  process.exit(2);
}

const key = (r) => (r.type === 'build' ? `build:${r.session}` : `pr:${r.pr}:${r.head_sha}`);
const existing = existsSync(out)
  ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
for (const r of rows) {
  const prev = existing.find((e) => key(e) === key(r));
  if (r.type === 'ci-review' && !r.conflicts?.measured && prev?.conflicts?.measured) {
    r.conflicts = prev.conflicts; // keep the earlier measurement; this run did not (or could not) redo it
  }
}
const replaced = new Set(rows.map(key));
const merged = [...existing.filter((r) => !replaced.has(key(r))), ...rows];
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, merged.map((r) => JSON.stringify(r)).join('\n') + '\n');
for (const r of rows) console.log(JSON.stringify(r));
