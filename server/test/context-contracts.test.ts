import { describe, it, expect } from 'vitest';
import {
  Agent,
  AgentVersionConfig,
  ContextListing,
  ContextPathsBody,
  RunTrace,
  Skill,
  SpecFile,
} from '@devdigest/shared';

const OLD_TRACE = {
  config: { agent: 'a', model: 'gpt-4.1' },
  stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, findings: 0, grounding: '0/0 passed' },
  prompt_assembly: { system: 's', user: 'u' },
  tool_calls: [],
  raw_output: '',
  memory_pulled: [],
  specs_read: [],
  log: [],
};

describe('SPEC-04 contracts', () => {
  it('EC-17: a pre-feature run_traces.trace (no project_context) still parses', () => {
    const parsed = RunTrace.safeParse(OLD_TRACE);
    if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
    expect(parsed.data.project_context).toBeUndefined();
  });

  it('a trace with project_context entries parses and rejects an unknown status', () => {
    const entry = { path: 'docs/a.md', kind: 'docs', origin: 'agent', sha: 'abc', tokens: 3, status: 'attached', text: 'x' };
    expect(RunTrace.safeParse({ ...OLD_TRACE, project_context: [entry] }).success).toBe(true);
    expect(RunTrace.safeParse({ ...OLD_TRACE, project_context: [{ ...entry, status: 'weird' }] }).success).toBe(false);
  });

  it('an old agent_versions.config_json (no context_paths) parses with []', () => {
    const p = AgentVersionConfig.parse({
      name: 'a',
      description: '',
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 's',
      temperature: 0,
      max_tokens: 100,
      strategy: 'auto',
      ci_fail_on: 'never',
      repo_intel: true,
      skills: [],
    });
    expect(p.context_paths).toEqual([]);
  });

  it('Agent / Skill DTOs default context_paths to [] for older payloads', () => {
    expect(Agent.shape.context_paths.parse(undefined)).toEqual([]);
    expect(Skill.shape.context_paths.parse(undefined)).toEqual([]);
  });

  it('SpecFile parses a legacy {path} and a full listing entry', () => {
    expect(SpecFile.safeParse({ path: 'docs/a.md' }).success).toBe(true);
    expect(
      SpecFile.safeParse({ path: 'docs/a.md', kind: 'docs', tokens: 1, attachable: false, unattachable_reason: 'too_large', used_by: 0 }).success,
    ).toBe(true);
    expect(SpecFile.safeParse({ path: 'a.md', kind: 'nope' }).success).toBe(false);
  });

  it('ContextListing accepts states/warnings, rejects unknown ones', () => {
    const base = { files: [], total: 0, scanned_at: '2026-01-01T00:00:00Z' };
    expect(ContextListing.safeParse({ ...base, state: 'not_cloned' }).success).toBe(true);
    expect(ContextListing.safeParse({ ...base, warning: 'fetch_failed' }).success).toBe(true);
    expect(ContextListing.safeParse({ ...base, warning: 'boom' }).success).toBe(false);
    expect(ContextListing.safeParse({ files: [] }).success).toBe(false);
  });

  it('ContextPathsBody requires an array of strings', () => {
    expect(ContextPathsBody.safeParse({ paths: ['docs/a.md'] }).success).toBe(true);
    expect(ContextPathsBody.safeParse({ paths: [] }).success).toBe(true);
    expect(ContextPathsBody.safeParse({ paths: 'docs/a.md' }).success).toBe(false);
    expect(ContextPathsBody.safeParse({}).success).toBe(false);
  });
});
