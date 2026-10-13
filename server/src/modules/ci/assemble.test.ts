import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { assembleExport, toCommitFiles, toPreview, type AssembleInput } from './assemble.js';
import { WORKFLOW_VERSION } from './constants.js';

const input = (over: Partial<AssembleInput> = {}): AssembleInput => ({
  agent: {
    name: 'Security Reviewer',
    provider: 'openrouter',
    model: 'm',
    system_prompt: 'p',
    strategy: 'auto',
    ci_fail_on: 'critical',
  },
  manifestSlug: 'security-reviewer',
  skills: [
    { name: 'OWASP', body: '# owasp\n' },
    { name: 'owasp', body: '# dup\n' },
  ],
  memoryRows: [{ id: 'm1', kind: 'fact', content: 'c', confidence: null, created_at: '2026-01-01T00:00:00.000Z' }],
  runnerFiles: [
    { path: 'package.json', size_bytes: 17, contents: '{"type":"module"}' },
    { path: 'index.js', size_bytes: 3, contents: 'x()' },
  ],
  workflow: { triggers: ['opened'], postAs: 'github_review' },
  ...over,
});

describe('assembleExport', () => {
  it('lists manifest, skills, memory, workflow, runner in that order (AC-28..AC-31)', () => {
    const { files } = assembleExport(input());
    expect(files.map((f) => f.path)).toEqual([
      '.devdigest/agents/security-reviewer.yaml',
      '.devdigest/skills/owasp.md',
      '.devdigest/skills/owasp-2.md',
      '.devdigest/memory.jsonl',
      '.github/workflows/devdigest-review.yml',
      '.devdigest/runner/package.json',
      '.devdigest/runner/index.js',
    ]);
    const manifest = files[0]!;
    expect(AgentManifest.parse(parse(manifest.contents!)).skills).toEqual(['owasp', 'owasp-2']);
  });

  it('marks only the workflow editable', () => {
    expect(assembleExport(input()).files.filter((f) => f.editable).map((f) => f.kind)).toEqual(['workflow']);
  });

  it('is byte-identical on a second call (NFR-5)', () => {
    expect(assembleExport(input())).toEqual(assembleExport(input()));
  });

  it('uses the override instead of the generated workflow', () => {
    const wf = assembleExport(input({ workflowOverride: 'name: edited\n' })).files.find((f) => f.kind === 'workflow');
    expect(wf?.contents).toBe('name: edited\n');
  });

  it('writes no skill file without enabled skills (EC-14)', () => {
    const { files } = assembleExport(input({ skills: [] }));
    expect(files.some((f) => f.kind === 'skill')).toBe(false);
    expect(AgentManifest.parse(parse(files[0]!.contents!)).skills).toEqual([]);
  });

  it('warns on a non-openrouter provider (EC-7) and on empty memory (EC-16)', () => {
    const { warnings } = assembleExport(
      input({ agent: { ...input().agent, provider: 'anthropic' }, memoryRows: [] }),
    );
    expect(warnings.map((w) => w.code)).toEqual(['provider_not_openrouter', 'memory_empty']);
  });

  it('warns when memory is truncated (EC-17)', () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      id: `m${i}`,
      kind: 'fact',
      content: 'c',
      confidence: null,
      created_at: new Date(i * 1000),
    }));
    const { warnings, files } = assembleExport(input({ memoryRows: rows }));
    expect(warnings).toEqual([{ code: 'memory_truncated', count: 501 }]);
    expect(files.find((f) => f.kind === 'memory')?.note).toBe('newest 500 of 501');
  });

  it('notes an empty memory file', () => {
    expect(assembleExport(input({ memoryRows: [] })).files.find((f) => f.kind === 'memory')?.note).toBe('empty');
  });
});

describe('toPreview / toCommitFiles', () => {
  it('leaves runner contents out of the preview (NFR-8)', () => {
    const preview = toPreview(assembleExport(input()));
    expect(preview.file_count).toBe(7);
    expect(preview.workflow_version).toBe(WORKFLOW_VERSION);
    for (const f of preview.files) expect(f.contents === null).toBe(f.kind === 'runner');
  });

  it('works with runner files listed without contents', () => {
    const assembled = assembleExport(input({ runnerFiles: [{ path: 'index.js', size_bytes: 1000 }] }));
    expect(assembled.files.at(-1)).toMatchObject({ kind: 'runner', contents: null, size_bytes: 1000 });
    expect(() => toCommitFiles(assembled)).toThrow();
  });

  it('commit files carry every path and its contents', () => {
    const files = toCommitFiles(assembleExport(input()));
    expect(files).toHaveLength(7);
    expect(files.find((f) => f.path === '.devdigest/runner/index.js')?.contents).toBe('x()');
  });
});
