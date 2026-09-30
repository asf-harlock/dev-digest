import { redactSecrets, wrapUntrusted } from '@devdigest/reviewer-core';
import type { Onboarding, TourSection } from '@devdigest/shared';
import {
  CRITICAL_PATHS_LIMIT,
  FIRST_TASKS_LIMIT,
  NODE_ID_RE,
  READING_PATH_LIMIT,
} from './constants.js';
import { collectCommands, collectEnvKeys, firstTaskComplexity, indexedDirs, isGroundedPath, packageDirsOf } from './helpers.js';
import type { RawTour } from './tour-schema.js';
import type { TourFacts } from './types.js';

/**
 * Pure pieces of the model enrichment: the facts prompt with its token budget,
 * and the grounding merge. The merge is the trust boundary: nothing the model
 * says reaches the stored tour unless it checks out against deterministic facts.
 */

const redact = (s: string): string => redactSecrets(s).text;

/** Reserved for the `<untrusted>` wrapper and headings around the facts block. */
const WRAPPER_RESERVE_TOKENS = 200;

export interface FactsPrompt {
  text: string;
  truncated: boolean;
}

/**
 * Render the facts in a fixed priority order (packages, commands, env names,
 * chains, then files by rank) and stop at the token budget. Truncation is
 * therefore always the lowest-ranked files first, and identical inputs give
 * identical output. `count` is the container tokenizer.
 */
export function buildFactsPrompt(facts: TourFacts, count: (text: string) => number, budget: number): FactsPrompt {
  const lines: string[] = [];
  let used = WRAPPER_RESERVE_TOKENS;
  let truncated = false;
  const add = (line: string): boolean => {
    if (truncated) return false;
    const safe = redact(line);
    const cost = count(safe) + 1;
    if (used + cost > budget) {
      truncated = true;
      return false;
    }
    used += cost;
    lines.push(safe);
    return true;
  };

  add(`Ranking: ${facts.mode === 'activity' ? 'recent activity' : 'import graph'}`);
  add(`README.md at repo root: ${facts.hasReadme ? 'yes' : 'no'}`);

  const pkgs = packageDirsOf(facts.manifests);
  if (pkgs.length > 0 && add('## Package directories')) for (const p of pkgs) add(`- ${p}`);

  const commands = collectCommands(facts.manifests, facts.packageManager);
  if (commands.length > 0 && add('## Commands (derived from manifests)')) {
    for (const c of commands) add(`- ${c.command}  [from ${c.source ?? 'manifest'}]`);
  }

  const env = collectEnvKeys(facts.manifests);
  if (env.length > 0 && add('## Environment variable names')) for (const k of env) add(`- ${k}`);

  if (facts.chains.length > 0 && add('## Dependency chains (importer -> imported)')) {
    for (const chain of facts.chains) add(`- ${chain.join(' -> ')}`);
  }

  if (facts.ranked.length > 0 && add('## Files by importance (most important first)')) {
    facts.ranked.forEach((f, i) => add(`${i + 1}. ${f.path}`));
  }

  return { text: wrapUntrusted('repository-facts', lines.join('\n')), truncated };
}

export interface MergeMeta {
  provider: string;
  model: string;
  generatedAt: string;
  truncated: boolean;
}

/** Keep `items` whose path is grounded; return the survivors and how many were dropped. */
function groundList<T extends { path: string }>(
  items: readonly T[],
  grounded: (p: string) => boolean,
): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    if (!grounded(it.path) || seen.has(it.path)) continue;
    seen.add(it.path);
    kept.push(it);
  }
  return { kept, dropped: items.length - kept.length };
}

/**
 * Merge model output into the deterministic skeleton.
 * - paths: anything not an indexed file or directory is dropped and counted;
 * - commands: only the skeleton's own (fact-derived); the model supplies at most
 *   a description, matched by exact command string;
 * - diagram: nodes need a grounded path and a clean id, edges need both ends;
 * - first tasks: must target at least one grounded path (EC-14);
 * - a section the model left empty (or fully dropped) keeps the skeleton's content;
 * - every free-text string is secret-redacted.
 */
export function mergeGrounded(skeleton: Onboarding, raw: RawTour, facts: TourFacts, meta: MergeMeta): Onboarding {
  const files = new Set<string>([
    ...facts.ranked.map((f) => f.path),
    ...facts.chains.flat(),
    ...facts.manifests.map((m) => m.path),
    ...(facts.hasReadme ? ['README.md'] : []),
  ]);
  const dirs = indexedDirs([...files]);
  const grounded = (p: string) => isGroundedPath(p, files, dirs);
  let dropped = 0;

  const sk = <K extends TourSection['kind']>(kind: K) =>
    skeleton.sections.find((s): s is Extract<TourSection, { kind: K }> => s.kind === kind);
  const skArch = sk('architecture');
  const skCrit = sk('critical_paths');
  const skRun = sk('run_locally');
  const skRead = sk('reading_path');
  const skTasks = sk('first_tasks');

  // architecture
  const nodeIds = new Set<string>();
  const nodes = raw.architecture.nodes.filter((n) => {
    const ok = NODE_ID_RE.test(n.id) && !nodeIds.has(n.id) && n.label.trim() !== '' && grounded(n.path);
    if (ok) nodeIds.add(n.id);
    return ok;
  });
  dropped += raw.architecture.nodes.length - nodes.length;
  const edgeKeys = new Set<string>();
  const edges = raw.architecture.edges.filter((e) => {
    const k = `${e.from}>${e.to}`;
    const ok = nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to && !edgeKeys.has(k);
    if (ok) edgeKeys.add(k);
    return ok;
  });
  dropped += raw.architecture.edges.length - edges.length;
  const useModelDiagram = nodes.length > 0;
  const architecture: Extract<TourSection, { kind: 'architecture' }> = {
    kind: 'architecture',
    body: raw.architecture.body.trim() ? redact(raw.architecture.body) : (skArch?.body ?? ''),
    nodes: useModelDiagram
      ? nodes.map((n) => ({ id: n.id, label: redact(n.label), path: n.path.replace(/\/+$/, '') }))
      : (skArch?.nodes ?? []),
    edges: useModelDiagram ? edges : (skArch?.edges ?? []),
  };

  // critical paths (rank / hotness come from facts, never from the model)
  const factRank = new Map(facts.ranked.map((f) => [f.path, f]));
  const crit = groundList(raw.critical_paths, grounded);
  dropped += crit.dropped;
  const critical: Extract<TourSection, { kind: 'critical_paths' }> =
    crit.kept.length > 0
      ? {
          kind: 'critical_paths',
          items: crit.kept.slice(0, CRITICAL_PATHS_LIMIT).map((c) => ({
            path: c.path,
            reason: redact(c.reason),
            rank: factRank.get(c.path)?.rank ?? null,
            hotness: factRank.get(c.path)?.hotness ?? null,
          })),
        }
      : (skCrit ?? { kind: 'critical_paths', items: [] });

  // run locally: skeleton commands only
  const described = new Map(raw.run_locally.map((c) => [c.command, c.description]));
  dropped += raw.run_locally.filter((c) => !(skRun?.commands ?? []).some((f) => f.command === c.command)).length;
  const run: Extract<TourSection, { kind: 'run_locally' }> = {
    kind: 'run_locally',
    commands: (skRun?.commands ?? []).map((c) => {
      const d = described.get(c.command);
      return d?.trim() ? { ...c, description: redact(d) } : c;
    }),
    env_keys: skRun?.env_keys ?? [],
  };

  // reading path
  const read = groundList(raw.reading_path, grounded);
  dropped += read.dropped;
  const reading: Extract<TourSection, { kind: 'reading_path' }> =
    read.kept.length > 0
      ? {
          kind: 'reading_path',
          items: read.kept.slice(0, READING_PATH_LIMIT).map((r) => ({ path: r.path, why: redact(r.why) })),
        }
      : (skRead ?? { kind: 'reading_path', items: [] });

  // first tasks: must target an existing file or indexed directory
  const tasks: Extract<TourSection, { kind: 'first_tasks' }>['items'] = [];
  for (const t of raw.first_tasks) {
    const paths = [...new Set(t.paths.filter(grounded))];
    dropped += t.paths.length - t.paths.filter(grounded).length;
    if (paths.length === 0) {
      dropped += 1;
      continue;
    }
    if (tasks.length >= FIRST_TASKS_LIMIT) continue;
    tasks.push({
      title: redact(t.title),
      description: redact(t.description),
      paths,
      complexity: t.complexity ?? firstTaskComplexity(paths),
    });
  }
  const firstTasks: Extract<TourSection, { kind: 'first_tasks' }> =
    tasks.length > 0 ? { kind: 'first_tasks', items: tasks } : (skTasks ?? { kind: 'first_tasks', items: [] });

  return {
    sections: [architecture, critical, run, reading, firstTasks],
    meta: {
      ...skeleton.meta,
      source: 'llm',
      model: meta.model,
      provider: meta.provider,
      generated_at: meta.generatedAt,
      last_error: null,
      last_error_at: null,
      dropped_count: dropped,
      truncated: meta.truncated,
    },
  };
}
