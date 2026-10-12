import { describe, it, expect } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  EvalCase,
  EvalCaseDetail,
  EvalCaseListItem,
  EvalCaseRename,
  EvalCaseLinks,
  EvalCaseOutcome,
  EvalRunRecord,
  EvalRunDetail,
  EvalAgentRunDetail,
  EvalSkillRunDetail,
  EvalSkillRunRecord,
  EvalSkillOverview,
  EvalSkillTrendPoint,
  EvalSkillCaseListItem,
  EvalLift,
  EvalSkillRunRequest,
  SkillEvalRunRequest,
  EvalRunStatus,
  EvalRunStart,
  EvalOverview,
  EvalDashboard,
  EvalCompare,
  EvalCompareQuery,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
} from '@devdigest/shared';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ intent: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(
      BlastRadius.parse({
        changed_symbols: [],
        downstream: [],
        summary: 's',
        degraded: true,
        reason: 'index_partial',
      }).reason,
    ).toBe('index_partial');
    expect(() =>
      BlastRadius.parse({ changed_symbols: [], downstream: [], summary: 's', reason: 'nope' }),
    ).toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / Onboarding / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', body: 'b', nodes: [], edges: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: { duration_ms: 8200, tokens_in: 14820, tokens_out: 1240, cost_usd: 0.06, findings: 3, grounding: '3/3 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

describe('Eval contracts (SPEC-08)', () => {
  const expectation = {
    type: 'must_find' as const,
    file: 'src/a.ts',
    start_line: 10,
    end_line: 12,
    severity: 'high',
    category: 'security',
    title: 'Hardcoded secret',
  };
  const ratio = (value: number | null, num: number, den: number) => ({ value, num, den });
  const metrics = {
    recall: ratio(0.5, 1, 2),
    precision: ratio(null, 0, 0),
    citation_accuracy: ratio(1, 3, 3),
    tp: 1,
    fp: 0,
    unlabeled: 2,
    traces_passed: 1,
    traces_total: 2,
    cases_errored: 0,
  };
  const run = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    agent_id: 'a1',
    agent_name: 'Security',
    status: 'completed',
    scope: 'set',
    started_at: '2026-10-01T10:00:00.000Z',
    finished_at: '2026-10-01T10:01:00.000Z',
    agent_version: 3,
    cases_total: 2,
    cases_done: 2,
    metrics,
    duration_ms: 60000,
    cost_usd: null,
    error_reason: null,
    ...over,
  });
  const scored = {
    case_id: 'c1',
    name: 'case one',
    expectation_type: 'must_find',
    status: 'scored',
    pass: true,
    error_reason: null,
    expected_count: 1,
    got_count: 1,
    findings: [
      {
        file: 'src/a.ts',
        start_line: 10,
        end_line: 11,
        title: 't',
        severity: 'high',
        category: 'security',
        label: 'tp',
      },
    ],
    grounding_kept: 1,
    grounding_total: 1,
    duration_ms: 1200,
    cost_usd: 0.01,
  };
  const errored = {
    ...scored,
    case_id: 'c2',
    status: 'errored',
    pass: null,
    error_reason: 'provider_error',
    expected_count: null,
    got_count: null,
    findings: [],
    cost_usd: null,
  };
  const caseRow = {
    id: 'c1',
    owner_kind: 'agent',
    owner_id: 'a1',
    name: 'case one',
    input_diff: 'diff --git a/src/a.ts b/src/a.ts\n',
    input_meta: { pr_number: 7, repo_full_name: 'o/r', title: 'T', body: null },
    expectation,
    source_finding_id: null,
    notes: null,
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
  };
  const latest = {
    run_id: 'r1',
    state: 'passed',
    expected_count: 1,
    got_count: 1,
    duration_ms: 10,
    cost_usd: null,
    error_reason: null,
  };

  it('case shapes: EvalCase / list item / detail / rename / links', () => {
    expect(() => EvalCase.parse(caseRow)).not.toThrow();
    expect(() =>
      EvalCaseListItem.parse({
        id: 'c1',
        name: 'n',
        expectation,
        created_at: 'x',
        latest_result: null,
      }),
    ).not.toThrow();
    expect(() =>
      EvalCaseDetail.parse({
        ...caseRow,
        source: { repo_id: 'rp', pr_number: 7 },
        latest_result: latest,
      }),
    ).not.toThrow();
    expect(() => EvalCaseDetail.parse({ ...caseRow, source: null, latest_result: null })).not.toThrow();
    expect(() => EvalCase.parse({ ...caseRow, expectation: { ...expectation, type: 'nope' } })).toThrow();
    expect(() => EvalCaseRename.parse({ name: 'ok' })).not.toThrow();
    expect(() => EvalCaseRename.parse({ name: '' })).toThrow();
    expect(() => EvalCaseRename.parse({ name: 'x'.repeat(81) })).toThrow();
    expect(() =>
      EvalCaseLinks.parse({ links: [{ finding_id: 'f', case_id: 'c', agent_id: 'a' }] }),
    ).not.toThrow();
  });

  it('EvalCaseOutcome: pass is null when errored', () => {
    expect(() => EvalCaseOutcome.parse(scored)).not.toThrow();
    expect(() => EvalCaseOutcome.parse(errored)).not.toThrow();
    expect(() => EvalCaseOutcome.parse({ ...scored, status: 'weird' })).toThrow();
    expect(() => EvalCaseOutcome.parse({ ...scored, findings: [{ ...scored.findings[0], label: 'x' }] })).toThrow();
  });

  it('EvalRunRecord: all four statuses, nullable metrics and ratio value', () => {
    for (const status of ['running', 'completed', 'partial', 'errored']) {
      expect(EvalRunStatus.safeParse(status).success).toBe(true);
      expect(() => EvalRunRecord.parse(run({ status }))).not.toThrow();
    }
    expect(EvalRunStatus.safeParse('queued').success).toBe(false);
    expect(() => EvalRunRecord.parse(run({ status: 'running', metrics: null, finished_at: null }))).not.toThrow();
    const parsed = EvalRunRecord.parse(run());
    expect(parsed.metrics?.precision.value).toBeNull();
    expect(() => EvalRunRecord.parse(run({ status: 'queued' }))).toThrow();
    expect(() => EvalRunRecord.parse(run({ cases_total: 'two' }))).toThrow();
  });

  it('EvalRunDetail / EvalRunStart', () => {
    expect(() =>
      EvalRunDetail.parse({
        ...run(),
        owner_kind: 'agent',
        snapshot: {
          provider: 'anthropic',
          model: 'm',
          strategy: 'auto',
          system_prompt: 'p',
          skills: [{ name: 's', body: 'b' }],
        },
        case_set: [{ id: 'c1', name: 'one' }],
        case_results: [scored, errored],
      }),
    ).not.toThrow();
    // The discriminator is required: an agent body without `owner_kind` no longer parses.
    const agentDetail = {
      ...run(),
      snapshot: {
        provider: 'anthropic',
        model: 'm',
        strategy: 'auto',
        system_prompt: 'p',
        skills: [],
      },
      case_set: [],
      case_results: [],
    };
    expect(() => EvalRunDetail.parse(agentDetail)).toThrow();
    expect(EvalRunDetail.parse({ ...agentDetail, owner_kind: 'agent' }).owner_kind).toBe('agent');
    expect(() => EvalAgentRunDetail.parse({ ...agentDetail, owner_kind: 'skill' })).toThrow();
    expect(() => EvalRunStart.parse({ id: 'r1', status: 'running' })).not.toThrow();
    expect(() => EvalRunStart.parse({ id: 'r1', status: 'completed' })).toThrow();
  });

  describe('skill eval runs (SPEC-09)', () => {
    const lift = { recall: 0.25, precision: null, citation_accuracy: -0.1 };
    const carrier = { agent_id: 'a1', name: 'Security', version: 3, model: 'm' };
    const skillRun = (over: Record<string, unknown> = {}) => ({
      id: 'r2',
      owner_kind: 'skill',
      skill_id: 's1',
      skill_name: 'sql-injection',
      skill_version: 2,
      carrier,
      status: 'completed',
      scope: 'set',
      started_at: '2026-10-01T10:00:00.000Z',
      finished_at: '2026-10-01T10:01:00.000Z',
      cases_total: 2,
      cases_done: 2,
      with: metrics,
      without: metrics,
      lift,
      cost_usd: 0.02,
      duration_ms: 90000,
      error_reason: null,
      ...over,
    });
    const skillDetail = {
      ...skillRun(),
      snapshot: {
        carrier: {
          ...carrier,
          provider: 'anthropic',
          strategy: 'auto',
          system_prompt: 'p',
        },
        skill: { name: 'sql-injection', body: 'b', version: 2 },
        with_skills: [{ name: 'sql-injection', body: 'b' }],
        without_skills: [],
      },
      case_set: [{ id: 'c1', name: 'one' }],
      case_results: [
        { case_id: 'c1', case_name: 'one', with: scored, without: errored, effect: 'errored' },
      ],
    };

    it('EvalSkillRunRecord: running run has null arms and lift; lift fields may be null', () => {
      expect(() => EvalSkillRunRecord.parse(skillRun())).not.toThrow();
      expect(() =>
        EvalSkillRunRecord.parse(
          skillRun({ status: 'running', finished_at: null, with: null, without: null, lift: null }),
        ),
      ).not.toThrow();
      expect(() => EvalLift.parse(lift)).not.toThrow();
      expect(() => EvalSkillRunRecord.parse(skillRun({ owner_kind: 'agent' }))).toThrow();
      expect(() => EvalSkillRunRecord.parse(skillRun({ carrier: { agent_id: 'a1' } }))).toThrow();
    });

    it('EvalRunDetail discriminates a skill run from an agent run by owner_kind', () => {
      const parsed = EvalRunDetail.parse(skillDetail);
      expect(parsed.owner_kind).toBe('skill');
      expect(() => EvalSkillRunDetail.parse(skillDetail)).not.toThrow();
      expect(() => EvalRunDetail.parse({ ...skillDetail, owner_kind: 'other' })).toThrow();
      expect(() =>
        EvalRunDetail.parse({ ...skillDetail, case_results: [{ ...skillDetail.case_results[0], effect: 'nope' }] }),
      ).toThrow();
      // a skill body is not accepted as an agent run and vice versa
      expect(() => EvalAgentRunDetail.parse(skillDetail)).toThrow();
    });

    it('EvalSkillOverview / EvalSkillTrendPoint', () => {
      const point = {
        run_id: 'r2',
        ran_at: 'x',
        skill_version: 2,
        carrier_agent_id: 'a1',
        carrier_name: 'Security',
        carrier_version: 3,
        model: 'm',
        recall: null,
        precision: 0.5,
        citation_accuracy: 1,
        lift,
        cost_usd: null,
      };
      expect(() => EvalSkillTrendPoint.parse(point)).not.toThrow();
      expect(() =>
        EvalSkillOverview.parse({
          skill: { id: 's1', name: 'n', version: 2, enabled: true },
          cases_total: 2,
          running_run_id: null,
          running_case_run: null,
          carriers: [{ ...carrier, enabled: true, link_enabled: false }],
          latest: skillRun(),
          previous: null,
          trend: [point],
        }),
      ).not.toThrow();
      expect(() =>
        EvalSkillOverview.parse({
          skill: { id: 's1', name: 'n', version: 2, enabled: true },
          cases_total: 0,
          running_run_id: null,
          running_case_run: null,
          carriers: [{ ...carrier, enabled: true }],
          latest: null,
          previous: null,
          trend: [],
        }),
      ).toThrow();
    });

    it('EvalSkillCaseListItem.latest_result and SkillEvalRunRequest', () => {
      const item = {
        id: 'c1',
        name: 'one',
        expectation,
        created_at: 'x',
        source_finding_id: null,
        latest_result: null,
      };
      expect(() => EvalSkillCaseListItem.parse(item)).not.toThrow();
      expect(() =>
        EvalSkillCaseListItem.parse({
          ...item,
          latest_result: {
            run_id: 'r2',
            with_state: 'passed',
            without_state: 'failed',
            effect: 'helped',
            expected_count: 1,
            got_count: 1,
            cost_usd: 0.02,
            error_reason: null,
          },
        }),
      ).not.toThrow();
      const id = '11111111-1111-4111-8111-111111111111';
      expect(() => SkillEvalRunRequest.parse({ carrier_agent_id: id })).not.toThrow();
      expect(EvalSkillRunRequest).toBe(SkillEvalRunRequest);
      expect(() => SkillEvalRunRequest.parse({ carrier_agent_id: 'nope' })).toThrow();
    });
  });

  it('EvalOverview / EvalDashboard allow null metrics in trend and sparkline', () => {
    expect(() =>
      EvalOverview.parse({
        agent: { id: 'a1', name: 'n', model: 'm', enabled: true },
        cases_total: 2,
        finished_runs: 1,
        running_run_id: null,
        running_case_run: null,
        latest: run(),
        previous: null,
        trend: [
          {
            run_id: 'r1',
            ran_at: 'x',
            agent_version: 3,
            recall: null,
            precision: 0.5,
            citation_accuracy: null,
            cost_usd: null,
          },
        ],
        runs: [run()],
      }),
    ).not.toThrow();
    expect(() =>
      EvalDashboard.parse({
        agents: [
          {
            agent_id: 'a1',
            agent_name: 'n',
            model: 'm',
            enabled: false,
            cases_total: 0,
            latest: null,
            sparkline: [0.5, null, 1],
          },
        ],
        recent_runs: [run()],
      }),
    ).not.toThrow();
  });

  it('EvalCompare / EvalCompareQuery', () => {
    const ratios = { recall: 0.5, precision: null, citation_accuracy: 1 };
    expect(() =>
      EvalCompare.parse({
        old: run(),
        new: run({ id: 'r2' }),
        common_cases: 2,
        only_old: 0,
        only_new: 1,
        common: { old: ratios, new: ratios },
        prompt_diff: [
          { kind: 'context', text: 'a' },
          { kind: 'removed', text: 'b' },
          { kind: 'added', text: 'c' },
        ],
        prompt_changed: true,
        skills_diff: { added: ['x'], removed: [], changed: ['y'] },
        model_change: { from: 'm1', to: 'm2' },
        strategy_change: null,
      }),
    ).not.toThrow();
    const id = '123e4567-e89b-42d3-a456-426614174000';
    expect(() => EvalCompareQuery.parse({ a: id, b: id })).not.toThrow();
    expect(() => EvalCompareQuery.parse({ a: 'nope', b: id })).toThrow();
  });
});
