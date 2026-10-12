/* EvalAgentDetailView.test.tsx — SPEC-08 /eval/agents/:id (AC-40..AC-45, EC-23, EC-28).
   One flow through the real child components (KPI cards, trend, runs table, modals);
   `fetch` is the outside world and AppShell is stubbed. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalOverview } from "@devdigest/shared";
import evalMessages from "../../../../../../../messages/en/eval.json";
import { metrics, runDetail, runRecord } from "../../../../../../test/eval-fixtures";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalAgentDetailView } from "./EvalAgentDetailView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RUN_NEW = runRecord({ id: "r2", agent_version: 2, started_at: "2026-09-02T10:00:00.000Z" });
const RUN_OLD = runRecord({
  id: "r1",
  agent_version: 1,
  started_at: "2026-09-01T10:00:00.000Z",
  metrics: metrics({ recall: { value: 0.7, num: 7, den: 10 }, precision: { value: null, num: 0, den: 0 } }),
});

function overview(over: Partial<EvalOverview> = {}): EvalOverview {
  return {
    agent: { id: "ag1", name: "Security Reviewer", model: "gpt-4.1", enabled: true },
    cases_total: 4,
    finished_runs: 2,
    running_run_id: null,
    running_case_run: null,
    latest: RUN_NEW,
    previous: RUN_OLD,
    trend: [
      { run_id: "r1", ran_at: RUN_OLD.started_at, agent_version: 1, recall: 0.7, precision: null, citation_accuracy: 0.9, cost_usd: null },
      { run_id: "r2", ran_at: RUN_NEW.started_at, agent_version: 2, recall: 0.75, precision: 0.8, citation_accuracy: 0.9, cost_usd: 0.12 },
    ],
    runs: [RUN_NEW, RUN_OLD],
    ...over,
  };
}

function stub(routes: { overview: EvalOverview | { status: number }; }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      let status = 200;
      let body: unknown = [];
      if (url.endsWith("/agents/ag1/eval-overview")) {
        if ("status" in routes.overview) {
          status = routes.overview.status;
          body = { error: { code: "not_found", message: "x" } };
        } else body = routes.overview;
      } else if (url.includes("/eval-runs/compare")) {
        body = {
          old: RUN_OLD,
          new: RUN_NEW,
          common_cases: 3,
          only_old: 0,
          only_new: 1,
          common: {
            old: { recall: 0.7, precision: 0.8, citation_accuracy: 0.9 },
            new: { recall: 0.75, precision: 0.8, citation_accuracy: 0.9 },
          },
          prompt_diff: [],
          prompt_changed: false,
          skills_diff: { added: [], removed: [], changed: [] },
          model_change: null,
          strategy_change: null,
        };
      } else if (/\/eval-runs\/r2$/.test(url)) body = runDetail({ id: "r2", agent_version: 2 });
      return { ok: status < 300, status, statusText: "", json: async () => body } as Response;
    }) as unknown as typeof fetch,
  );
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <EvalAgentDetailView agentId="ag1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalAgentDetailView (SPEC-08)", () => {
  it("AC-40..AC-45: shows header, KPI cards with deltas and the trend; two selected runs open Compare, a row opens the run", async () => {
    stub({ overview: overview() });
    renderView();

    expect(await screen.findByRole("heading", { name: "Security Reviewer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /All agents/ })).toHaveAttribute("href", "/eval");
    expect(screen.getByText("2 runs on the 4-case set")).toBeInTheDocument();

    // KPI: recall 75% with ▲ 5 pt against the previous run; precision has no previous value → em dash delta.
    expect(within(screen.getByRole("group", { name: "Recall" })).getByText("▲ 5 pt")).toBeInTheDocument();
    const precision = screen.getByRole("group", { name: "Precision" });
    expect(within(precision).getByText("80%")).toBeInTheDocument();
    expect(within(precision).getByText("no comparison available")).toBeInTheDocument(); // EC-20
    expect(screen.getByRole("img", { name: "Recall, precision and citation accuracy over the last 2 runs" })).toBeInTheDocument();

    // AC-56/AC-57/EC-27: the shared trend's tooltip — version, date, three metrics, cost ("—" when null).
    const trendRuns = screen.getAllByRole("button", { name: /^v\d · / });
    expect(trendRuns).toHaveLength(2);
    expect(trendRuns[0]).toHaveAccessibleName(expect.stringContaining("Precision — · Citation accuracy 90% · Cost —"));
    expect(trendRuns[1]).toHaveAccessibleName(expect.stringContaining("Recall 75% · Precision 80% · Citation accuracy 90% · Cost $0.12"));
    fireEvent.focus(trendRuns[1]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("v2 ·");
    fireEvent.keyDown(trendRuns[1]!, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Compare opens with the two selected finished runs, old → new.
    fireEvent.click(screen.getByRole("checkbox", { name: "Select run v2 for comparison" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select run v1 for comparison" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Compare runs · v1 → v2")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // A row opens that run's results.
    fireEvent.click(screen.getByRole("button", { name: "Open results of run v2" }));
    expect(await screen.findByText(/^Run v2 · /)).toBeInTheDocument();
  });

  it("EC-23: an agent with no finished run shows em dashes in the KPI cards and 'No runs yet' for trend and table", async () => {
    stub({ overview: overview({ finished_runs: 0, latest: null, previous: null, trend: [], runs: [] }) });
    renderView();

    await screen.findByRole("heading", { name: "Security Reviewer" });
    expect(screen.getAllByText("No runs yet")).toHaveLength(2);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it("EC-11: Run eval is disabled with the reason when the agent has no cases; EC-28: a disabled agent gets the badge", async () => {
    stub({
      overview: overview({
        cases_total: 0,
        agent: { id: "ag1", name: "Security Reviewer", model: "gpt-4.1", enabled: false },
      }),
    });
    renderView();

    const run = await screen.findByRole("button", { name: "Run eval" });
    expect(run).toBeDisabled();
    expect(run).toHaveAccessibleDescription("Add eval cases from PR findings first");
    expect(screen.getByText("disabled")).toBeInTheDocument();
  });

  it("shows the not-found state for an unknown agent", async () => {
    stub({ overview: { status: 404 } });
    renderView();
    expect(await screen.findByText("Agent not found")).toBeInTheDocument();
  });
});
