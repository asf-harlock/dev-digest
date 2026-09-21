import { describe, it, expect } from 'vitest';
import {
  buildSkillDrafts,
  extractLocalCandidates,
  toConventionDto,
  toScanDto,
  verifyEvidence,
  type LlmConventionCandidate,
} from '../src/modules/conventions/helpers.js';
import type { ConventionRow, RepoConventionScanRow } from '../src/db/rows.js';

const FILE_CONTENT = [
  'export async function getUser(id: string) {',
  '  const user = await db.users.find(id);',
  '  return user;',
  '}',
].join('\n');

function candidate(overrides: Partial<LlmConventionCandidate> = {}): LlmConventionCandidate {
  return {
    category: 'error_handling',
    rule: 'Always await db calls',
    evidence_path: 'src/api/users.ts',
    start_line: 1,
    end_line: 2,
    snippet: 'const user = await db.users.find(id);',
    confidence: 0.9,
    ...overrides,
  };
}

describe('verifyEvidence', () => {
  it('accepts a candidate whose path/lines/snippet all match the sampled file', () => {
    const sampled = new Map([['src/api/users.ts', FILE_CONTENT]]);
    expect(verifyEvidence(candidate(), sampled).ok).toBe(true);
  });

  it('tolerates whitespace differences between the snippet and the cited lines', () => {
    const sampled = new Map([['src/api/users.ts', FILE_CONTENT]]);
    const c = candidate({ snippet: '  const   user =   await db.users.find(id);  ' });
    expect(verifyEvidence(c, sampled).ok).toBe(true);
  });

  it('rejects a path that was not sampled', () => {
    const sampled = new Map([['src/other.ts', FILE_CONTENT]]);
    const result = verifyEvidence(candidate(), sampled);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not sampled/);
  });

  it('rejects an out-of-range line', () => {
    const sampled = new Map([['src/api/users.ts', FILE_CONTENT]]);
    const result = verifyEvidence(candidate({ start_line: 1, end_line: 999 }), sampled);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/exceeds/);
  });

  it('rejects an invalid range (end before start)', () => {
    const sampled = new Map([['src/api/users.ts', FILE_CONTENT]]);
    const result = verifyEvidence(candidate({ start_line: 3, end_line: 1 }), sampled);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/invalid line range/);
  });

  it('rejects a snippet that does not match the cited lines', () => {
    const sampled = new Map([['src/api/users.ts', FILE_CONTENT]]);
    const result = verifyEvidence(candidate({ snippet: 'this text is not in the file' }), sampled);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/does not match/);
  });
});

function row(overrides: Partial<ConventionRow> = {}): ConventionRow {
  return {
    id: 'c1',
    workspaceId: 'w1',
    repoId: 'r1',
    scanId: 's1',
    category: 'error_handling',
    rule: 'Always await db calls',
    evidencePath: 'src/api/users.ts',
    evidenceStartLine: 1,
    evidenceEndLine: 2,
    evidenceSnippet: 'const user = await db.users.find(id);',
    confidence: 0.9,
    status: 'accepted',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as ConventionRow;
}

describe('toConventionDto / toScanDto', () => {
  it('round-trips a row into the nested evidence shape', () => {
    const dto = toConventionDto(row());
    expect(dto).toMatchObject({
      id: 'c1',
      scan_id: 's1',
      category: 'error_handling',
      rule: 'Always await db calls',
      evidence: { path: 'src/api/users.ts', start_line: 1, end_line: 2 },
      status: 'accepted',
    });
    expect(dto.created_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('maps a scan row', () => {
    const scanRow: RepoConventionScanRow = {
      id: 's1',
      workspaceId: 'w1',
      repoId: 'r1',
      sampleFileCount: 40,
      configFileCount: 3,
      candidateCount: 2,
      mode: 'ai',
      provider: 'openai',
      model: 'gpt-4o-mini',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(toScanDto(scanRow)).toMatchObject({
      id: 's1',
      repo_id: 'r1',
      sample_file_count: 40,
      config_file_count: 3,
      candidate_count: 2,
      mode: 'ai',
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  it('maps a local scan row with null provider/model', () => {
    const scanRow: RepoConventionScanRow = {
      id: 's2',
      workspaceId: 'w1',
      repoId: 'r1',
      sampleFileCount: 0,
      configFileCount: 1,
      candidateCount: 1,
      mode: 'local',
      provider: null,
      model: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(toScanDto(scanRow)).toMatchObject({ mode: 'local', provider: null, model: null });
  });
});

describe('extractLocalCandidates', () => {
  it('derives a candidate from a matching tsconfig setting', () => {
    const candidates = extractLocalCandidates([
      { path: 'tsconfig.json', content: '{\n  "compilerOptions": {\n    "strict": true\n  }\n}' },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      category: 'other',
      evidence_path: 'tsconfig.json',
      start_line: 3,
      end_line: 3,
      confidence: 1,
    });
    expect(candidates[0]!.rule).toContain('strict');
  });

  it('fills the %s placeholder from the matched capture group', () => {
    const candidates = extractLocalCandidates([
      { path: '.prettierrc.json', content: '{\n  "tabWidth": 2\n}' },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.rule).toBe('Indent with 2 spaces.');
  });

  it('ignores config files it does not recognize', () => {
    expect(extractLocalCandidates([{ path: 'babel.config.js', content: '"strict": true' }])).toEqual([]);
  });

  it('returns [] when no rule matches the file content', () => {
    expect(extractLocalCandidates([{ path: 'tsconfig.json', content: '{}' }])).toEqual([]);
  });

  it('never calls a model — pure string matching only', () => {
    expect(() => extractLocalCandidates([{ path: '.eslintrc.json', content: '"no-console": "error"' }])).not.toThrow();
  });
});

describe('buildSkillDrafts', () => {
  const a = row({ id: 'a', category: 'error_handling', rule: 'Always await db calls' });
  const b = row({ id: 'b', category: 'style', rule: 'Use async/await instead of .then()' });
  const c = row({ id: 'c', category: 'style', rule: 'Prefer const over let' });

  it('returns [] for an empty selection', () => {
    expect(buildSkillDrafts([], 'merge', 'acme/repo')).toEqual([]);
  });

  it('merge with one candidate names the draft after that candidate\'s own rule', () => {
    const [draft] = buildSkillDrafts([a], 'merge', 'acme/repo');
    expect(draft).toMatchObject({
      name: 'always-await-db-calls',
      description: 'Always await db calls',
      type: 'convention',
      evidence_files: ['src/api/users.ts'],
    });
    expect(draft!.body).toContain('# always-await-db-calls');
    expect(draft!.body).toContain('Detected in `src/api/users.ts:1-2`');
  });

  it('merge with several candidates produces one generic bundle', () => {
    const drafts = buildSkillDrafts([a, b], 'merge', 'acme/repo');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ name: 'repo-conventions' });
    expect(drafts[0]!.body).toContain('## always-await-db-calls');
    expect(drafts[0]!.body).toContain('## use-async-await-instead-of-then');
  });

  it('per_candidate produces one draft per candidate, 1:1', () => {
    const drafts = buildSkillDrafts([a, b], 'per_candidate', 'acme/repo');
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.name)).toEqual(['always-await-db-calls', 'use-async-await-instead-of-then']);
  });

  it('per_candidate de-dupes colliding slugs within the same batch', () => {
    const dup = row({ id: 'dup', rule: 'Always await db calls' });
    const drafts = buildSkillDrafts([a, dup], 'per_candidate', 'acme/repo');
    expect(drafts.map((d) => d.name)).toEqual(['always-await-db-calls', 'always-await-db-calls-2']);
  });

  it('per_category groups by category; an absent category produces no draft', () => {
    const drafts = buildSkillDrafts([a, b, c], 'per_category', 'acme/repo');
    expect(drafts).toHaveLength(2);
    const byName = new Map(drafts.map((d) => [d.name, d]));
    expect(byName.get('convention-error-handling')!.evidence_files).toEqual(['src/api/users.ts']);
    const style = byName.get('convention-style')!;
    expect(style.body).toContain('## use-async-await-instead-of-then');
    expect(style.body).toContain('## prefer-const-over-let');
  });
});
