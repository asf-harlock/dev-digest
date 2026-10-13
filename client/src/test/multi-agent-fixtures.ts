/* multi-agent-fixtures.ts — typed factories and a `fetch` router for the SPEC-11 tests.
   Test support only (same role as eval-fixtures.ts). `fetch` is the outside world: the hooks,
   api.ts and react-query under test stay real. */
import { vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import type {
  Agent,
  AgentColumn,
  AgentEstimate,
  Conflict,
  ConflictTake,
  FindingRecord,
  MultiAgentRun,
  PrMeta,
  RunSummary,
} from "@devdigest/shared";

export function agent(over: Partial<Agent> = {}): Agent {
  return {
    id: "ag1",
    name: "Security Reviewer",
    description: "Finds security bugs",
    provider: "openai",
    model: "gpt-4.1",
    system_prompt: "p",
    enabled: true,
    version: 1,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
    ...over,
  } as Agent;
}

export function pr(over: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr1",
    number: 7,
    title: "Add payments retry",
    author: "ann",
    branch: "feat/x",
    base: "main",
    head_sha: "abc123",
    additions: 10,
    deletions: 2,
    files_count: 3,
    status: "open",
    ...over,
  };
}

export function runSummary(over: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 1,
    tokens_out: 1,
    cost_usd: null,
    findings_count: 0,
    grounding: null,
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...over,
  };
}

export function estimate(over: Partial<AgentEstimate> = {}): AgentEstimate {
  return { agent_id: "ag1", duration_ms: 8200, cost_usd: 0.06, runs_used: 3, ...over };
}

export function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "security",
    title: "Unvalidated input",
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "The handler trusts the body.",
    suggestion: null,
    confidence: 0.86,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

export function column(over: Partial<AgentColumn> = {}): AgentColumn {
  return {
    run_id: "run-a",
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    error: null,
    verdict: null,
    score: 82,
    summary: "Looks mostly fine.",
    duration_ms: 8200,
    cost_usd: 0.06,
    findings: [],
    ...over,
  };
}

export function take(over: Partial<ConflictTake> = {}): ConflictTake {
  return {
    run_id: "run-a",
    agent_id: "ag1",
    persona: "Security Reviewer",
    verdict: "WARNING",
    note: "",
    dismissed: false,
    ...over,
  };
}

export function conflict(over: Partial<Conflict> = {}): Conflict {
  return {
    file: "src/api/users.ts",
    line: 45,
    title: "Unvalidated input",
    contended: true,
    takes: [],
    ...over,
  };
}

export function maRun(over: Partial<MultiAgentRun> = {}): MultiAgentRun {
  return {
    id: "mar1",
    pr_id: "pr1",
    pr_number: 7,
    ran_at: "2026-06-11T18:44:34.000Z",
    agent_count: 2,
    total_duration_ms: 12_000,
    total_cost_usd: 0.1,
    columns: [],
    conflicts: [],
    ...over,
  };
}

export interface FetchReply {
  status?: number;
  body?: unknown;
}
export type FetchHandler = FetchReply | ((call: { method: string; url: string; body: unknown }) => FetchReply);
export interface FetchCall {
  method: string;
  url: string;
  body: unknown;
}

/**
 * Stubs global `fetch`. `routes` maps `"METHOD /path-regex-source"` to a reply (or a function
 * of the call, so a test can change the answer between polls). Unmatched requests answer 404
 * with an API error body. Every request is recorded in `calls`.
 */
export function stubApi(routes: Record<string, FetchHandler>) {
  const calls: FetchCall[] = [];
  const table = Object.entries(routes).map(([key, handler]) => {
    const [method, ...rest] = key.split(" ");
    return { method: method!, re: new RegExp(`${rest.join(" ")}$`), handler };
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = String(input).replace(/^https?:\/\/[^/]+/, "").split("?")[0]!;
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const call = { method, url, body };
      calls.push(call);
      const hit = table.find((r) => r.method === method && r.re.test(url));
      const reply: FetchReply = hit
        ? typeof hit.handler === "function"
          ? hit.handler(call)
          : hit.handler
        : { status: 404, body: { error: { code: "not_found", message: "no route" } } };
      const status = reply.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: "",
        json: async () => reply.body,
      } as Response;
    }),
  );
  return calls;
}

export const apiError = (status: number, code = "error"): FetchReply => ({
  status,
  body: { error: { code, message: code } },
});

/** `@testing-library/user-event` is not installed in client/ — a minimal stand-in with the same
 *  awaited call shape for the clicks these tests need. */
export function userEvent() {
  return {
    click: async (el: Element) => {
      fireEvent.click(el);
    },
  };
}
