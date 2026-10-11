/* EvalDashboardView.test.tsx — SPEC-08 /eval page (AC-52..AC-54, EC-19, EC-24, EC-28, EC-36).
   `fetch` is the outside world; AppShell (sidebar/topbar/repo context) is stubbed. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalAgentSummary, EvalDashboard } from "@devdigest/shared";
import evalMessages from "../../../../../messages/en/eval.json";
import { metrics, runRecord } from "../../../../test/eval-fixtures";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

function agent(over: Partial<EvalAgentSummary> = {}): EvalAgentSummary {
  return {
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    model: "gpt-4.1",
    enabled: true,
    cases_total: 4,
    latest: runRecord(),
    sparkline: [0.5, 0.6, 0.75],
    ...over,
  };
}

function stub(body: EvalDashboard | { error: unknown }, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status < 300, status, statusText: "", json: async () => body })) as unknown as typeof fetch,
  );
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <EvalDashboardView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalDashboardView (SPEC-08)", () => {
  it("AC-52/53/54: title, one card per agent with last run + metrics, and the recent-runs table that navigates", async () => {
    stub({
      agents: [
        agent(),
        agent({
          agent_id: "ag2",
          agent_name: "Style Reviewer",
          enabled: false,
          latest: runRecord({ id: "run9", agent_id: "ag2", agent_name: "Style Reviewer", agent_version: 5 }),
        }),
      ],
      recent_runs: [runRecord({ id: "run1" }), runRecord({ id: "run2", agent_id: "ag2", agent_name: "Style Reviewer", agent_version: 5 })],
    });
    renderView();

    expect(screen.getByRole("heading", { name: "Eval Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Regression harness across all reviewer agents · pick an agent to see its runs")).toBeInTheDocument();

    const link = await screen.findByRole("link", { name: "Open eval details for Security Reviewer" });
    expect(link).toHaveAttribute("href", "/eval/agents/ag1");
    const card = link.closest("li")!;
    expect(within(card).getByText("gpt-4.1")).toBeInTheDocument();
    expect(within(card).getByText(/Last run v2 · .* · 3\/4 pass/)).toBeInTheDocument();
    expect(within(card).getByText("75%")).toBeInTheDocument();
    expect(within(card).queryByText("disabled")).not.toBeInTheDocument();

    // EC-28: a disabled agent keeps its card and gets the badge.
    const second = screen.getByRole("link", { name: "Open eval details for Style Reviewer" }).closest("li")!;
    expect(within(second).getByText("disabled")).toBeInTheDocument();

    // Clicking the card body (not the link) navigates to the detail page.
    fireEvent.click(within(card).getByText("Recall"));
    expect(push).toHaveBeenCalledWith("/eval/agents/ag1");

    const table = screen.getByRole("table", { name: "Recent eval runs · all agents" });
    expect(within(table).getAllByRole("row")).toHaveLength(3); // header + 2 runs
    push.mockReset();
    fireEvent.click(within(table).getByText("v5"));
    expect(push).toHaveBeenCalledWith("/eval/agents/ag2");
  });

  it("EC-24/EC-19: agents without a run show 'No runs yet' and em dashes (never 0%), and the table says 'No eval runs yet'", async () => {
    stub({ agents: [agent({ latest: null, sparkline: [] })], recent_runs: [] });
    renderView();

    const card = (await screen.findByRole("link", { name: "Open eval details for Security Reviewer" })).closest("li")!;
    expect(within(card).getByText("No runs yet")).toBeInTheDocument();
    expect(within(card).getAllByText("—").length).toBeGreaterThanOrEqual(3);
    expect(card).not.toHaveTextContent("0%");
    expect(screen.getByText("No eval runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("EC-19/EC-36: a null recall shows an em dash and the sparkline leaves a gap rather than plotting 0", async () => {
    stub({
      agents: [
        agent({
          latest: runRecord({ metrics: metrics({ recall: { value: null, num: 0, den: 0 } }) }),
          sparkline: [0.5, null, 0.7],
        }),
      ],
      recent_runs: [],
    });
    renderView();

    const card = (await screen.findByRole("link", { name: "Open eval details for Security Reviewer" })).closest("li")!;
    expect(within(card).getByText("Recall").nextElementSibling).toHaveTextContent("—");
    const spark = within(card).getByRole("img", { name: "Recall over the last 3 runs" });
    const path = spark.querySelector("path")!;
    expect(path.getAttribute("d")!.match(/M/g)).toHaveLength(2); // broken line: a gap at the null
  });

  it("shows an error state with Retry when the dashboard cannot load, and an empty state without agents", async () => {
    stub({ error: { code: "internal", message: "x" } }, 404);
    renderView();
    expect(await screen.findByText("Couldn’t load the eval dashboard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/ })).toBeInTheDocument();
    cleanup();

    stub({ agents: [], recent_runs: [] });
    renderView();
    expect(await screen.findByText("No agents yet")).toBeInTheDocument();
  });

  it("NFR-7: the agent-card link and the recent-runs agent link are at least 24px tall", async () => {
    stub({ agents: [agent()], recent_runs: [runRecord()] });
    renderView();
    const links = await screen.findAllByRole("link", { name: /Open eval details for Security Reviewer/ });
    expect(links).toHaveLength(2); // card + table row
    for (const l of links) expect(parseFloat(l.style.minHeight)).toBeGreaterThanOrEqual(24);
  });
});
