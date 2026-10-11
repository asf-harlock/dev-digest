/* eval-fixtures.ts — typed factories for SPEC-08 test data. Test support only. */
import type {
  EvalCaseListItem,
  EvalMetrics,
  EvalAgentRunDetail,
  EvalRunRecord,
} from "@devdigest/shared";

export function ratio(value: number | null, num = 0, den = 0) {
  return { value, num, den };
}

export function metrics(over: Partial<EvalMetrics> = {}): EvalMetrics {
  return {
    recall: ratio(0.75, 3, 4),
    precision: ratio(0.8, 8, 10),
    citation_accuracy: ratio(0.9, 9, 10),
    tp: 3,
    fp: 2,
    unlabeled: 5,
    traces_passed: 3,
    traces_total: 4,
    cases_errored: 0,
    ...over,
  };
}

export function runRecord(over: Partial<EvalRunRecord> = {}): EvalRunRecord {
  return {
    id: "run1",
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    status: "completed",
    started_at: "2026-09-20T10:00:00.000Z",
    finished_at: "2026-09-20T10:01:00.000Z",
    agent_version: 2,
    cases_total: 4,
    cases_done: 4,
    metrics: metrics(),
    duration_ms: 60_000,
    cost_usd: 0.12,
    error_reason: null,
    ...over,
  };
}

export function runDetail(over: Partial<EvalAgentRunDetail> = {}): EvalAgentRunDetail {
  return {
    ...runRecord(),
    owner_kind: "agent",
    snapshot: {
      provider: "openai",
      model: "gpt-4.1",
      strategy: "single-pass",
      system_prompt: "You are a security reviewer.",
      skills: [],
    },
    case_set: [],
    case_results: [],
    ...over,
  } as EvalAgentRunDetail;
}

export function caseItem(over: Partial<EvalCaseListItem> = {}): EvalCaseListItem {
  return {
    id: "c1",
    name: "stripe-key-leak",
    expectation: {
      type: "must_find",
      file: "src/config.ts",
      start_line: 11,
      end_line: 12,
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded secret",
    },
    created_at: "2026-09-19T10:00:00.000Z",
    latest_result: null,
    ...over,
  };
}
