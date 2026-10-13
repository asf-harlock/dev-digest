import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import {
  assertValidWorkflowYaml,
  buildWorkflowYaml,
  orderTriggers,
  validateWorkflowYaml,
  type WorkflowOptions,
} from './workflow.js';
import { PINNED_ACTIONS, WORKFLOW_MAX_BYTES, WORKFLOW_VERSION } from './constants.js';

type Step = { name?: string; uses?: string; run?: string; if?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Workflow = {
  name: string;
  on: { pull_request: { types: string[] } };
  jobs: { review: { if: string; permissions: Record<string, string>; steps: Step[] } };
};

const base: WorkflowOptions = { triggers: ['opened', 'synchronize'], postAs: 'github_review' };
const load = (opts: WorkflowOptions = base): Workflow => parse(buildWorkflowYaml(opts)) as Workflow;

describe('buildWorkflowYaml', () => {
  it('is deterministic (NFR-5)', () => {
    expect(buildWorkflowYaml(base)).toBe(
      buildWorkflowYaml(base),
    );
  });

  it('puts exactly the chosen triggers in canonical order (AC-21)', () => {
    expect(load().on.pull_request.types).toEqual(['opened', 'synchronize']);
    const reordered = parse(
      buildWorkflowYaml({ triggers: ['reopened', 'opened', 'reopened'], postAs: 'none' }),
    ) as Workflow;
    expect(reordered.on.pull_request.types).toEqual(['opened', 'reopened']);
    expect(orderTriggers(['reopened', 'synchronize'])).toEqual(['synchronize', 'reopened']);
  });

  it('rejects an empty trigger list (EC-6)', () => {
    expect(() => buildWorkflowYaml({ triggers: [], postAs: 'none' })).toThrow();
  });

  it('runs only on pull requests from the same repository (AC-22)', () => {
    expect(load().jobs.review.if).toBe('github.event.pull_request.head.repo.full_name == github.repository');
  });

  it('does not key the guard on the fork flag, which is true for every PR of a forked repository (AC-22)', () => {
    expect(load().jobs.review.if).not.toContain('.fork');
  });

  it('grants pull-requests: write only when posting (AC-23)', () => {
    expect(load().jobs.review.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
    expect(load({ ...base, postAs: 'pr_comment' }).jobs.review.permissions['pull-requests']).toBe('write');
    expect(load({ ...base, postAs: 'none' }).jobs.review.permissions).toEqual({ contents: 'read' });
  });

  it('runs the bundled runner on Node 22 with the required env (AC-24)', () => {
    const steps = load().jobs.review.steps;
    const node = steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
    expect(node?.with?.['node-version']).toBe('22');
    const run = steps.find((s) => s.run?.startsWith('node '));
    expect(run?.run).toBe('node .devdigest/runner/index.js');
    expect(run?.env).toMatchObject({
      OPENROUTER_API_KEY: '${{ secrets.OPENROUTER_API_KEY }}',
      GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
      DEVDIGEST_POST_AS: 'github_review',
    });
    expect(run?.env?.GITHUB_REPOSITORY).toBeTruthy();
    expect(run?.env?.PR_NUMBER).toBeTruthy();
  });

  it('writes the sidecar after the runner, always, with values from env only (AC-25)', () => {
    const steps = load().jobs.review.steps;
    const runnerIdx = steps.findIndex((s) => s.run?.startsWith('node '));
    const sidecarIdx = steps.findIndex((s) => s.run?.includes('devdigest-run.json'));
    expect(sidecarIdx).toBeGreaterThan(runnerIdx);
    expect(steps[sidecarIdx]!.if).toBe('always()');
    expect(steps[sidecarIdx]!.env).toMatchObject({
      DEVDIGEST_COMMIT_SHA: '${{ github.event.pull_request.head.sha }}',
      DEVDIGEST_REPOSITORY: '${{ github.repository }}',
      DEVDIGEST_PR_NUMBER: '${{ github.event.pull_request.number }}',
    });
  });

  it('uploads both files even when the runner failed (AC-26)', () => {
    const upload = load().jobs.review.steps.find((s) => s.uses?.startsWith('actions/upload-artifact@'));
    expect(upload?.if).toBe('always()');
    expect(upload?.with).toMatchObject({
      name: 'devdigest-result',
      path: 'devdigest-result.json\ndevdigest-run.json',
      'if-no-files-found': 'warn',
    });
  });

  it('never puts a ${{ }} expression into a run: line (UI-7)', () => {
    for (const postAs of ['github_review', 'pr_comment', 'none'] as const) {
      for (const step of load({ ...base, postAs }).jobs.review.steps) {
        if (step.run !== undefined) expect(step.run).not.toContain('${{');
      }
    }
  });

  it('pins every action by full commit SHA with a version comment (NFR-7)', () => {
    const text = buildWorkflowYaml(base);
    const uses = [...text.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)\s*(#.*)?$/gm)];
    expect(uses).toHaveLength(Object.keys(PINNED_ACTIONS).length);
    for (const m of uses) {
      expect(m[1]).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
      expect(m[2]).toMatch(/^# v\d+\.\d+\.\d+$/);
    }
  });

  it('mentions the version and devdigest/review-action@v1 only in the header comment (AC-27)', () => {
    const text = buildWorkflowYaml(base);
    const [header, ...rest] = text.split(/\nname:/);
    expect(header).toContain(`workflow version ${WORKFLOW_VERSION}`);
    expect(header).toContain('devdigest/review-action@v1');
    expect(rest.join('')).not.toContain('review-action');
    expect(parse(text)).not.toHaveProperty('devdigest');
    expect(text.startsWith('#')).toBe(true);
  });

  it('does not wrap long lines', () => {
    const text = buildWorkflowYaml(base);
    expect(text).toContain('node .devdigest/runner/index.js');
  });
});

describe('validateWorkflowYaml (UI-3, EC-11)', () => {
  it('accepts the generated workflow', () => {
    expect(validateWorkflowYaml(buildWorkflowYaml(base))).toEqual({ ok: true });
  });
  it('returns the parser message for invalid YAML', () => {
    const r = validateWorkflowYaml('name: [unclosed\n  x: : :');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });
  it('rejects non-mapping documents', () => {
    expect(validateWorkflowYaml('- a\n- b').ok).toBe(false);
    expect(validateWorkflowYaml('').ok).toBe(false);
  });
  it('rejects text over 64 KiB', () => {
    const big = `name: x\nnote: ${'a'.repeat(WORKFLOW_MAX_BYTES)}\n`;
    const r = validateWorkflowYaml(big);
    expect(r.ok).toBe(false);
  });
  it('assertValidWorkflowYaml throws a 422', () => {
    expect(() => assertValidWorkflowYaml('a: [')).toThrowError(expect.objectContaining({ statusCode: 422 }));
  });
});
