import { describe, it, expect } from 'vitest';
import { Onboarding, OnboardingTourGenerateRequest } from '@devdigest/shared';

describe('Onboarding tour contract (server copy)', () => {
  it('defaults missing meta on an old document', () => {
    const r = Onboarding.parse({ sections: [] });
    expect(r.meta.source).toBe('skeleton');
    expect(r.meta.ranking_mode).toBe('import_graph');
    expect(r.meta.dropped_count).toBe(0);
    expect(r.meta.truncated).toBe(false);
  });

  it('defaults absent fields inside a partial meta', () => {
    const r = Onboarding.parse({ sections: [], meta: { model: 'gpt-4.1' } });
    expect(r.meta.model).toBe('gpt-4.1');
    expect(r.meta.source).toBe('skeleton');
    expect(r.meta.last_error).toBeUndefined();
  });

  it('accepts null for persisted nullish meta fields', () => {
    const r = Onboarding.parse({ sections: [], meta: { last_error: null, model: null } });
    expect(r.meta.last_error).toBeNull();
  });

  it('round-trips a typed document', () => {
    const doc = {
      sections: [
        { kind: 'architecture', body: 'hi', nodes: [{ id: 'a', label: 'A', path: 'src' }], edges: [] },
        { kind: 'critical_paths', items: [{ path: 'src/a.ts', reason: 'hub', rank: 0.4 }] },
        { kind: 'run_locally', commands: [{ command: 'pnpm dev' }], env_keys: ['PORT'] },
        { kind: 'reading_path', items: [{ path: 'src/a.ts', why: 'start' }] },
        { kind: 'first_tasks', items: [{ title: 't', description: 'd', paths: [] }] },
      ],
      meta: { source: 'llm', ranking_mode: 'activity', window_days: 180, dropped_count: 2, truncated: true },
    };
    expect(Onboarding.parse(Onboarding.parse(doc))).toEqual(Onboarding.parse(doc));
  });

  it('rejects an unknown section kind', () => {
    expect(Onboarding.safeParse({ sections: [{ kind: 'routes_and_apis' }] }).success).toBe(false);
  });

  it.each([6, 731, 7.5, '30'])('rejects window_days %s', (w) => {
    expect(
      OnboardingTourGenerateRequest.safeParse({ mode: 'activity', window_days: w }).success,
    ).toBe(false);
  });

  it.each([7, 180, 730])('accepts window_days %s', (w) => {
    expect(
      OnboardingTourGenerateRequest.safeParse({ mode: 'activity', window_days: w }).success,
    ).toBe(true);
  });

  it('defaults the request mode', () => {
    expect(OnboardingTourGenerateRequest.parse({}).mode).toBe('import_graph');
  });
});
