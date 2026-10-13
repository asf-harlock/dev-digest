import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { buildManifestYaml, manifestPath, skillPath, type ManifestAgent } from './manifest.js';

const agent: ManifestAgent = {
  name: 'Security Reviewer',
  provider: 'openrouter',
  model: 'anthropic/claude-sonnet-4',
  system_prompt: 'You review PRs.\nBe strict: "quotes", # hash, key: value\n',
  strategy: 'single-pass',
  ci_fail_on: 'warning',
};

describe('buildManifestYaml', () => {
  it('validates against AgentManifest and round-trips the text (AC-28)', () => {
    const parsed = AgentManifest.parse(parse(buildManifestYaml(agent, ['a', 'b'])));
    expect(parsed).toMatchObject({
      name: agent.name,
      provider: 'openrouter',
      model: agent.model,
      system_prompt: agent.system_prompt,
      skills: ['a', 'b'],
      strategy: 'single-pass',
      ci_fail_on: 'warning',
    });
  });

  it('writes an empty skills list when there are none (EC-14)', () => {
    expect(AgentManifest.parse(parse(buildManifestYaml(agent, []))).skills).toEqual([]);
  });

  it('keeps hostile prompt text as data (UI-1, NFR-6)', () => {
    const hostile = { ...agent, name: 'x\nskills: [evil]', system_prompt: '---\n- injected: true\n!!js/function "x"\n&a *a' };
    const parsed = AgentManifest.parse(parse(buildManifestYaml(hostile, ['ok'])));
    expect(parsed.skills).toEqual(['ok']);
    expect(parsed.name).toBe(hostile.name);
    expect(parsed.system_prompt).toBe(hostile.system_prompt);
  });

  it('round-trips carriage returns and unicode', () => {
    const odd = { ...agent, system_prompt: 'a\r\nb\u2028c — ✓ \t tab' };
    expect(AgentManifest.parse(parse(buildManifestYaml(odd, []))).system_prompt).toBe(odd.system_prompt);
  });

  it('is deterministic (NFR-5)', () => {
    expect(buildManifestYaml(agent, ['a'])).toBe(buildManifestYaml(agent, ['a']));
  });

  it('throws a 422 when the manifest would not validate (EC-5)', () => {
    expect(() => buildManifestYaml({ ...agent, name: '' }, [])).toThrowError(
      expect.objectContaining({ statusCode: 422 }),
    );
    expect(() => buildManifestYaml({ ...agent, model: '' }, [])).toThrow();
  });
});

describe('paths', () => {
  it('places files under .devdigest', () => {
    expect(manifestPath('sec')).toBe('.devdigest/agents/sec.yaml');
    expect(skillPath('lint')).toBe('.devdigest/skills/lint.md');
  });
});
