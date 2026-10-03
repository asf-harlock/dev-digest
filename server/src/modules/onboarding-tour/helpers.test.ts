import { describe, it, expect } from 'vitest';
import { Onboarding } from '@devdigest/shared';
import {
  buildSkeleton,
  collectCommands,
  collectEnvKeys,
  computeStale,
  firstTaskComplexity,
  groupByPackage,
  indexedDirs,
  isGroundedPath,
  applyHotness,
  orderByRank,
  parseEnvKeys,
} from './helpers.js';
import type { ManifestFact, TourFacts } from './types.js';

const manifest = (path: string, text: string): ManifestFact => {
  const i = path.lastIndexOf('/');
  return { path, dir: i < 0 ? '' : path.slice(0, i), name: path.slice(i + 1), text };
};

const facts = (over: Partial<TourFacts> = {}): TourFacts => ({
  ranked: [
    { path: 'src/core/engine.ts', rank: 0.9 },
    { path: 'src/api/routes.ts', rank: 0.7 },
    { path: 'packages/web/app.ts', rank: 0.7 },
  ],
  chains: [['src/api/routes.ts', 'src/core/engine.ts']],
  manifests: [
    manifest('package.json', JSON.stringify({ scripts: { dev: 'rm -rf /', test: 'vitest', other: 'x' } })),
    manifest('packages/web/package.json', JSON.stringify({ scripts: { build: 'next build' } })),
    manifest('.env.example', 'API_KEY=secret-value\n# comment\nexport DB_URL=postgres://u:p@h/db\n'),
  ],
  packageManager: 'pnpm',
  hasReadme: true,
  degradedReason: null,
  indexSha: 'abc',
  mode: 'import_graph',
  windowDays: null,
  rankingFallback: null,
  ...over,
});

describe('orderByRank', () => {
  it('orders by rank desc with path asc tie-break and does not mutate', () => {
    const input = [
      { path: 'b.ts', rank: 0.5 },
      { path: 'a.ts', rank: 0.5 },
      { path: 'c.ts', rank: 0.9 },
    ];
    expect(orderByRank(input).map((f) => f.path)).toEqual(['c.ts', 'a.ts', 'b.ts']);
    expect(input[0]!.path).toBe('b.ts');
  });
});

describe('grounding sets', () => {
  it('an indexed directory is an ancestor of an indexed file', () => {
    const dirs = indexedDirs(['src/a/b.ts', 'README.md']);
    expect([...dirs].sort()).toEqual(['src', 'src/a']);
    const files = new Set(['src/a/b.ts']);
    expect(isGroundedPath('src/a', files, dirs)).toBe(true);
    expect(isGroundedPath('src/a/', files, dirs)).toBe(true);
    expect(isGroundedPath('src/a/b.ts', files, dirs)).toBe(true);
    expect(isGroundedPath('src/zzz', files, dirs)).toBe(false);
  });
});

describe('groupByPackage', () => {
  it('uses the longest matching package dir and falls back to the root', () => {
    const g = groupByPackage(['packages/web/a.ts', 'packages/web/ui/b.ts', 'src/c.ts'], ['packages', 'packages/web']);
    expect(g.get('packages/web')).toEqual(['packages/web/a.ts', 'packages/web/ui/b.ts']);
    expect(g.get('')).toEqual(['src/c.ts']);
  });
});

describe('manifest facts', () => {
  it('returns env key names only, never values', () => {
    expect(parseEnvKeys('A=1\n#B=2\nexport C = x\nA=dup')).toEqual(['A', 'C']);
    const json = JSON.stringify(collectEnvKeys(facts().manifests));
    expect(json).toContain('API_KEY');
    expect(json).not.toContain('secret-value');
    expect(json).not.toContain('postgres://');
  });

  it('derives commands from manifests and never echoes script bodies', () => {
    const cmds = collectCommands(facts().manifests, 'pnpm');
    const text = cmds.map((c) => c.command);
    expect(text).toContain('pnpm install');
    expect(text).toContain('pnpm run dev');
    expect(text).toContain('pnpm run test');
    expect(text).toContain('cd packages/web && pnpm run build');
    expect(text.join('\n')).not.toContain('rm -rf');
    expect(cmds.find((c) => c.command === 'pnpm run dev')?.source).toBe('package.json');
  });

  it('skips a manifest in an unsafe directory name', () => {
    const cmds = collectCommands([manifest('a b;x/package.json', '{"scripts":{"dev":"x"}}')], 'npm');
    expect(cmds).toEqual([]);
  });
});

describe('buildSkeleton', () => {
  it('is deterministic and parses as a valid tour with all five sections', () => {
    const a = buildSkeleton(facts());
    const b = buildSkeleton(facts());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(Onboarding.safeParse(a).success).toBe(true);
    expect(a.sections.map((s) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'run_locally',
      'reading_path',
      'first_tasks',
    ]);
    expect(a.meta.source).toBe('skeleton');
    expect(a.meta.index_sha).toBe('abc');
  });

  it('does not depend on the input order of ranked files', () => {
    const f = facts();
    const shuffled = facts({ ranked: [...f.ranked].reverse() });
    expect(JSON.stringify(buildSkeleton(shuffled))).toBe(JSON.stringify(buildSkeleton(f)));
  });

  it('ranks critical paths and notes the package', () => {
    const s = buildSkeleton(facts());
    const cp = s.sections.find((x) => x.kind === 'critical_paths');
    if (cp?.kind !== 'critical_paths') throw new Error('missing');
    expect(cp.items.map((i) => i.path)).toEqual(['src/core/engine.ts', 'packages/web/app.ts', 'src/api/routes.ts']);
    expect(cp.items[1]!.reason).toContain('`packages/web`');
  });

  it('builds grounded diagram nodes and edges from chains', () => {
    const s = buildSkeleton(facts());
    const arch = s.sections[0];
    if (arch?.kind !== 'architecture') throw new Error('missing');
    const byId = new Map(arch.nodes.map((n) => [n.id, n.path]));
    expect(arch.edges.length).toBe(1);
    expect(byId.get(arch.edges[0]!.from)).toBe('src/api');
    expect(byId.get(arch.edges[0]!.to)).toBe('src/core');
  });

  it('degrades to empty sections without an index but keeps manifest commands', () => {
    const s = buildSkeleton(facts({ ranked: [], chains: [], degradedReason: 'No index yet', indexSha: null }));
    expect(s.meta.degraded_reason).toBe('No index yet');
    const cp = s.sections[1];
    if (cp?.kind !== 'critical_paths') throw new Error('missing');
    expect(cp.items).toEqual([]);
    const run = s.sections[2];
    if (run?.kind !== 'run_locally') throw new Error('missing');
    expect(run.commands.length).toBeGreaterThan(0);
  });

  it('gives empty sections and no crash with no facts at all', () => {
    const s = buildSkeleton(facts({ ranked: [], chains: [], manifests: [], hasReadme: false }));
    expect(Onboarding.safeParse(s).success).toBe(true);
    const arch = s.sections[0];
    if (arch?.kind !== 'architecture') throw new Error('missing');
    expect(arch.body.length).toBeGreaterThan(0);
  });
});

describe('computeStale', () => {
  it('is stale only when both SHAs exist and differ', () => {
    expect(computeStale('a', 'b')).toBe(true);
    expect(computeStale('a', 'a')).toBe(false);
    expect(computeStale(null, 'b')).toBe(false);
    expect(computeStale('a', null)).toBe(false);
  });
});

describe('firstTaskComplexity', () => {
  it('is low for no targets and docs/tests-only targets', () => {
    expect(firstTaskComplexity([])).toBe('low');
    expect(firstTaskComplexity(['README.md', 'docs/a.ts', 'src/a.test.ts'])).toBe('low');
  });
  it('is medium when any target is a source file', () => {
    expect(firstTaskComplexity(['README.md', 'src/a.ts'])).toBe('medium');
  });
});

describe('activity ranking', () => {
  it('hotness is count / max count over indexed files only, 0..1', () => {
    const ranked = [
      { path: 'a.ts', rank: 1 },
      { path: 'b.ts', rank: 1 },
      { path: 'c.ts', rank: 1 },
    ];
    // `x.ts` is not indexed, so its 100 commits must not set the maximum.
    const out = applyHotness(ranked, { 'a.ts': 10, 'b.ts': 5, 'x.ts': 100 });
    expect(out.map((f) => f.hotness)).toEqual([1, 0.5, 0]);
  });

  it('an all-zero window gives hotness 0 everywhere (no NaN)', () => {
    expect(applyHotness([{ path: 'a.ts', rank: 1 }], {}).map((f) => f.hotness)).toEqual([0]);
  });

  it('orders by rank x (1 + hotness) with path-ascending tie-break', () => {
    const files = applyHotness(
      [
        { path: 'engine.ts', rank: 1.0 },
        { path: 'routes.ts', rank: 0.9 },
        { path: 'log.ts', rank: 0.8 },
        { path: 'b-tie.ts', rank: 0.5 },
        { path: 'a-tie.ts', rank: 0.5 },
      ],
      { 'log.ts': 10, 'routes.ts': 5 },
    );
    expect(orderByRank(files, 'activity').map((f) => f.path)).toEqual([
      'log.ts', // 0.8 * 2 = 1.6
      'routes.ts', // 0.9 * 1.5 = 1.35
      'engine.ts', // 1.0
      'a-tie.ts',
      'b-tie.ts',
    ]);
    // import-graph mode ignores hotness
    expect(orderByRank(files, 'import_graph').map((f) => f.path).slice(0, 3)).toEqual(['engine.ts', 'routes.ts', 'log.ts']);
  });

  it('skeleton in activity mode carries mode, window and per-file hotness', () => {
    const f = facts({ mode: 'activity', windowDays: 30, ranked: applyHotness(facts().ranked, { 'src/api/routes.ts': 4 }) });
    const s = buildSkeleton(f);
    expect(s.meta.ranking_mode).toBe('activity');
    expect(s.meta.window_days).toBe(30);
    const cp = s.sections[1];
    if (cp?.kind !== 'critical_paths') throw new Error('x');
    expect(cp.items[0]!.path).toBe('src/api/routes.ts');
    expect(cp.items[0]!.hotness).toBe(1);
    const rp = s.sections[3];
    if (rp?.kind !== 'reading_path') throw new Error('x');
    expect(rp.items.find((i) => i.path === 'src/api/routes.ts')?.hotness).toBe(1);
    expect(rp.items.find((i) => i.path === 'README.md')?.hotness).toBe(0);
    const plain = buildSkeleton(facts()).sections[3];
    if (plain?.kind !== 'reading_path') throw new Error('x');
    expect(plain.items.every((i) => i.hotness === null)).toBe(true);
  });
});

describe('reading path size (AC-8)', () => {
  it('lists at most 5 files', () => {
    const ranked = Array.from({ length: 20 }, (_, i) => ({ path: `src/f${i}.ts`, rank: 1 - i / 100 }));
    const s = buildSkeleton(facts({ ranked, chains: [ranked.map((r) => r.path)] }));
    const rp = s.sections[3];
    if (rp?.kind !== 'reading_path') throw new Error('x');
    expect(rp.items).toHaveLength(5);
    expect(rp.items[0]!.path).toBe('README.md');
  });
});

describe('per-package commands (EC-16)', () => {
  const pkg = (path: string, pm: string, ownLockfile: boolean, scripts: object = { dev: 'x' }): ManifestFact => {
    const i = path.lastIndexOf('/');
    return { path, dir: i < 0 ? '' : path.slice(0, i), name: path.slice(i + 1), text: JSON.stringify({ scripts }), pm, ownLockfile };
  };

  it('each package with its own lockfile gets its own install and runs, using its own manager', () => {
    const cmds = collectCommands(
      [pkg('server/package.json', 'pnpm', true), pkg('e2e/package.json', 'npm', true), pkg('client/package.json', 'pnpm', true)],
      'npm',
    ).map((c) => c.command);
    expect(cmds).toEqual([
      'cd client && pnpm install',
      'cd client && pnpm run dev',
      'cd e2e && npm install',
      'cd e2e && npm run dev',
      'cd server && pnpm install',
      'cd server && pnpm run dev',
    ]);
  });

  it('workspace members without their own lockfile are installed from the root only', () => {
    const cmds = collectCommands([pkg('package.json', 'pnpm', true), pkg('packages/a/package.json', 'pnpm', false)], 'pnpm').map(
      (c) => c.command,
    );
    expect(cmds).toContain('pnpm install');
    expect(cmds).not.toContain('cd packages/a && pnpm install');
    expect(cmds).toContain('cd packages/a && pnpm run dev');
  });

  it('without a root package.json a lockfile-less package still gets an install step', () => {
    const cmds = collectCommands([pkg('app/package.json', 'npm', false)], 'npm').map((c) => c.command);
    expect(cmds[0]).toBe('cd app && npm install');
  });
});
