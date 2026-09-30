import type {
  Onboarding,
  TourArchitecture,
  TourCommand,
  TourCriticalPaths,
  TourDiagramEdge,
  TourDiagramNode,
  TourFirstTasks,
  TourReadingPath,
  TourRunLocally,
} from '@devdigest/shared';
import {
  ARCHITECTURE_EMPTY_BODY,
  ARCHITECTURE_NODE_LIMIT,
  CRITICAL_PATHS_LIMIT,
  FIRST_TASKS_LIMIT,
  NODE_DEPTH,
  READING_PATH_LIMIT,
  SAFE_DIR_RE,
  SCRIPT_DESCRIPTIONS,
  SCRIPT_ORDER,
} from './constants.js';
import type { ManifestFact, RankedFile, TourFacts } from './types.js';

/** Pure transforms only: no IO, no clock, no randomness (NFR-3 determinism). */

// ---- Ranking --------------------------------------------------------------

/** Rank DESC, path ASC as the deterministic tie-break. Does not mutate. */
export function orderByRank(files: readonly RankedFile[]): RankedFile[] {
  return [...files].sort((a, b) => b.rank - a.rank || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// ---- Paths / grounding ----------------------------------------------------

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** Every ancestor directory of every file. An indexed directory is a parent of an indexed file (Q6). */
export function indexedDirs(paths: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const p of paths) {
    let d = dirOf(p);
    while (d && !out.has(d)) {
      out.add(d);
      d = dirOf(d);
    }
  }
  return out;
}

/** A path is grounded when it is an indexed file or an indexed directory. */
export function isGroundedPath(path: string, files: ReadonlySet<string>, dirs: ReadonlySet<string>): boolean {
  const p = path.replace(/\/+$/, '');
  return files.has(p) || dirs.has(p);
}

/** Collapse a file path to its first `depth` directory segments. */
export function nodeDir(path: string, depth: number = NODE_DEPTH): string {
  return dirOf(path).split('/').filter(Boolean).slice(0, depth).join('/');
}

/** Group paths by the nearest package directory (longest prefix); `''` = repo root. */
export function groupByPackage(paths: readonly string[], packageDirs: readonly string[]): Map<string, string[]> {
  const dirs = [...packageDirs].filter(Boolean).sort((a, b) => b.length - a.length);
  const out = new Map<string, string[]>();
  for (const p of paths) {
    const pkg = dirs.find((d) => p.startsWith(`${d}/`)) ?? '';
    const arr = out.get(pkg);
    if (arr) arr.push(p);
    else out.set(pkg, [p]);
  }
  return out;
}

export function packageDirsOf(manifests: readonly ManifestFact[]): string[] {
  const dirs = new Set<string>();
  for (const m of manifests) {
    if (m.dir && ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml'].includes(m.name)) dirs.add(m.dir);
  }
  return [...dirs].sort();
}

// ---- Manifest facts -------------------------------------------------------

/** Key names from a `.env.example`. Values are never read into the output. */
export function parseEnvKeys(text: string): string[] {
  const keys: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (m?.[1] && !keys.includes(m[1])) keys.push(m[1]);
  }
  return keys;
}

/** Script names present in a `package.json`; script bodies are untrusted and never returned. */
export function parseScriptNames(text: string): string[] {
  try {
    const scripts = (JSON.parse(text) as { scripts?: unknown }).scripts;
    if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return [];
    return Object.keys(scripts);
  } catch {
    return [];
  }
}

function withDir(dir: string, cmd: string): string {
  return dir && SAFE_DIR_RE.test(dir) ? `cd ${dir} && ${cmd}` : cmd;
}

export function commandsFromManifest(m: ManifestFact, pm: string): TourCommand[] {
  const cmd = (command: string, description: string): TourCommand => ({ command, description, source: m.path });
  if (m.dir && !SAFE_DIR_RE.test(m.dir)) return [];
  switch (m.name) {
    case 'package.json': {
      const names = new Set(parseScriptNames(m.text));
      const out: TourCommand[] = [];
      if (!m.dir) out.push(cmd(`${pm} install`, 'Install dependencies'));
      for (const s of SCRIPT_ORDER) {
        if (names.has(s)) out.push(cmd(withDir(m.dir, `${pm} run ${s}`), SCRIPT_DESCRIPTIONS[s]));
      }
      return out;
    }
    case 'requirements.txt':
      return [cmd(withDir(m.dir, 'pip install -r requirements.txt'), 'Install Python dependencies')];
    case 'pyproject.toml':
      return [cmd(withDir(m.dir, 'pip install -e .'), 'Install the Python package')];
    case 'go.mod':
      return [
        cmd(withDir(m.dir, 'go run .'), 'Run the Go program'),
        cmd(withDir(m.dir, 'go test ./...'), 'Run the Go tests'),
      ];
    case 'Cargo.toml':
      return [
        cmd(withDir(m.dir, 'cargo run'), 'Run the Rust binary'),
        cmd(withDir(m.dir, 'cargo test'), 'Run the Rust tests'),
      ];
    case 'docker-compose.yml':
    case 'docker-compose.yaml':
    case 'compose.yml':
    case 'compose.yaml':
      return [cmd(`docker compose -f ${m.path} up -d`, 'Start the compose services')];
    default:
      return [];
  }
}

/** Every command derivable from manifests, sorted by source path (stable). */
export function collectCommands(manifests: readonly ManifestFact[], pm: string): TourCommand[] {
  const sorted = [...manifests].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const out: TourCommand[] = [];
  const seen = new Set<string>();
  for (const m of sorted) {
    for (const c of commandsFromManifest(m, pm)) {
      if (seen.has(c.command)) continue;
      seen.add(c.command);
      out.push(c);
    }
  }
  return out;
}

export function collectEnvKeys(manifests: readonly ManifestFact[]): string[] {
  const keys = new Set<string>();
  for (const m of manifests) if (m.name === '.env.example') for (const k of parseEnvKeys(m.text)) keys.add(k);
  return [...keys].sort();
}

// ---- Skeleton -------------------------------------------------------------

function buildNodes(ranked: readonly RankedFile[]): TourDiagramNode[] {
  const dirs: string[] = [];
  for (const f of ranked) {
    const d = nodeDir(f.path);
    if (d && !dirs.includes(d)) dirs.push(d);
    if (dirs.length >= ARCHITECTURE_NODE_LIMIT) break;
  }
  return dirs.map((d, i) => ({ id: `n${i}`, label: d, path: d }));
}

function buildEdges(chains: readonly string[][], nodes: readonly TourDiagramNode[]): TourDiagramEdge[] {
  const idOf = new Map(nodes.map((n) => [n.path, n.id]));
  const seen = new Set<string>();
  const out: TourDiagramEdge[] = [];
  for (const chain of chains) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const from = idOf.get(nodeDir(chain[i]!));
      const to = idOf.get(nodeDir(chain[i + 1]!));
      if (!from || !to || from === to || seen.has(`${from}>${to}`)) continue;
      seen.add(`${from}>${to}`);
      out.push({ from, to });
    }
  }
  return out;
}

function buildArchitecture(facts: TourFacts, ordered: readonly RankedFile[]): TourArchitecture {
  const nodes = buildNodes(ordered);
  const edges = buildEdges(facts.chains, nodes);
  const pkgs = packageDirsOf(facts.manifests);
  const lines: string[] = [];
  if (pkgs.length > 0) lines.push(`This repository contains ${pkgs.length} package(s): ${pkgs.map((p) => `\`${p}\``).join(', ')}.`);
  if (nodes.length > 0) {
    lines.push(`The most central areas by import rank are ${nodes.map((n) => `\`${n.path}\``).join(', ')}.`);
  }
  return {
    kind: 'architecture',
    body: lines.length > 0 ? lines.join('\n\n') : ARCHITECTURE_EMPTY_BODY,
    nodes,
    edges,
  };
}

function buildCriticalPaths(facts: TourFacts, ordered: readonly RankedFile[]): TourCriticalPaths {
  const pkgs = packageDirsOf(facts.manifests);
  const byPkg = groupByPackage(ordered.map((f) => f.path), pkgs);
  const pkgOf = new Map<string, string>();
  for (const [pkg, paths] of byPkg) for (const p of paths) pkgOf.set(p, pkg);
  const items = ordered.slice(0, CRITICAL_PATHS_LIMIT).map((f, i) => {
    const pkg = pkgOf.get(f.path);
    const where = pkg ? ` in package \`${pkg}\`` : '';
    return {
      path: f.path,
      reason: `Ranked #${i + 1} by ${facts.mode === 'activity' ? 'recent activity' : 'import graph'}${where}`,
      rank: f.rank,
      hotness: f.hotness ?? null,
    };
  });
  return { kind: 'critical_paths', items };
}

function buildRunLocally(facts: TourFacts): TourRunLocally {
  return {
    kind: 'run_locally',
    commands: collectCommands(facts.manifests, facts.packageManager),
    env_keys: collectEnvKeys(facts.manifests),
  };
}

function buildReadingPath(facts: TourFacts, ordered: readonly RankedFile[]): TourReadingPath {
  const items: TourReadingPath['items'] = [];
  const seen = new Set<string>();
  const push = (path: string, why: string) => {
    if (seen.has(path) || items.length >= READING_PATH_LIMIT) return;
    seen.add(path);
    items.push({ path, why });
  };
  if (facts.hasReadme) push('README.md', 'Start with the project overview');
  const chain = [...facts.chains].sort((a, b) => b.length - a.length)[0] ?? [];
  for (const p of chain) push(p, 'Follows the main dependency chain from an entry point');
  for (const f of ordered) push(f.path, 'One of the most imported files');
  return { kind: 'reading_path', items };
}

/**
 * Complexity rule for deterministic first tasks: a task whose targets are all
 * docs/tests (or that has no target, e.g. "run the tests") is `low`; any other
 * source-file target is `medium`. The model may supply `high` in slice 3.
 */
const LOW_COMPLEXITY_PATH = /(^|\/)(docs?|tests?|__tests__|specs?)\/|\.(md|mdx|txt)$|\.(test|spec)\.[a-z]+$/i;
export function firstTaskComplexity(paths: readonly string[]): 'low' | 'medium' {
  return paths.every((p) => LOW_COMPLEXITY_PATH.test(p)) ? 'low' : 'medium';
}

function buildFirstTasks(facts: TourFacts, ordered: readonly RankedFile[]): TourFirstTasks {
  const items: TourFirstTasks['items'] = [];
  const testCmd = collectCommands(facts.manifests, facts.packageManager).find((c) => /\b(test)\b/.test(c.command));
  if (testCmd) {
    items.push({
      title: 'Run the test suite',
      description: `Run \`${testCmd.command}\` and confirm everything passes before you change anything.`,
      paths: [],
      complexity: firstTaskComplexity([]),
    });
  }
  const top = ordered[0];
  if (top) {
    items.push({
      title: 'Read the most central file',
      description: `Read \`${top.path}\` end to end and note who imports it.`,
      paths: [top.path],
      complexity: firstTaskComplexity([top.path]),
    });
  }
  const second = ordered[1];
  if (second) {
    items.push({
      title: 'Trace one dependency',
      description: `Follow how \`${second.path}\` connects to the rest of the code.`,
      paths: [second.path],
      complexity: firstTaskComplexity([second.path]),
    });
  }
  return { kind: 'first_tasks', items: items.slice(0, FIRST_TASKS_LIMIT) };
}

/**
 * Deterministic tour from facts alone. `generated_at` is stamped by the caller
 * so this stays pure; the output has no model and no clock.
 */
export function buildSkeleton(facts: TourFacts): Onboarding {
  const ordered = orderByRank(facts.ranked);
  return {
    sections: [
      buildArchitecture(facts, ordered),
      buildCriticalPaths(facts, ordered),
      buildRunLocally(facts),
      buildReadingPath(facts, ordered),
      buildFirstTasks(facts, ordered),
    ],
    meta: {
      source: 'skeleton',
      degraded_reason: facts.degradedReason,
      index_sha: facts.indexSha,
      ranking_mode: 'import_graph',
      window_days: facts.windowDays,
      model: null,
      provider: null,
      generated_at: null,
      last_error: null,
      last_error_at: null,
      dropped_count: 0,
      truncated: false,
      ranking_fallback: facts.rankingFallback,
    },
  };
}

/** Stale = the tour was built against a different index SHA than the current one. */
export function computeStale(storedSha: string | null | undefined, currentSha: string | null): boolean {
  return Boolean(storedSha && currentSha && storedSha !== currentSha);
}
