/* ConfigureRunView.test.tsx — SPEC-11 Configure run screen (AC-9…AC-12, AC-7, EC-1, EC-5, EC-6,
   EC-7, EC-8, EC-9, EC-25). `fetch` is the outside world; AppShell and the repo context are stubbed. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import prReview from "../../../../../../../messages/en/prReview.json";
import shell from "../../../../../../../messages/en/shell.json";
import { agent, apiError, estimate, maRun, pr, runSummary, stubApi, userEvent } from "../../../../../../test/multi-agent-fixtures";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({ repoId: "r1" }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({ useRepoNotFound: () => false }));

import { ConfigureRunView } from "./ConfigureRunView";

beforeEach(() => nav.push.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENTS = [
  agent({ id: "ag1", name: "Security Reviewer", description: "Finds security bugs" }),
  agent({ id: "ag2", name: "Style Reviewer", description: "Checks style" }),
  agent({ id: "ag3", name: "Legacy Reviewer", enabled: false, description: "Old" }),
];
const ESTIMATES = {
  agents: [
    estimate({ agent_id: "ag1", duration_ms: 8200, cost_usd: 0.06 }),
    estimate({ agent_id: "ag2", duration_ms: 12000, cost_usd: null }),
    estimate({ agent_id: "ag3", duration_ms: null, cost_usd: null, runs_used: 0 }),
  ],
};

function api(over: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    "GET /repos/r1/pulls": { body: [pr({ id: "pr1", number: 7, title: "Add payments retry" })] },
    "GET /agents": { body: AGENTS },
    "GET /multi-agent/estimates": { body: ESTIMATES },
    "GET /pulls/pr1/runs": { body: [] },
    ...over,
  });
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview, shell }}>
        <ConfigureRunView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function selectPr(number = "7") {
  const select = await screen.findByRole("combobox");
  await screen.findByRole("option", { name: /#7 · Add payments retry|#\d+ ·/ });
  fireEvent.change(select, { target: { value: number } });
}
const runButton = (name: string | RegExp = /^Run multi-agent review/) => screen.getByRole("button", { name });
const box = (name: RegExp) => screen.getByRole("checkbox", { name });

describe("ConfigureRunView", () => {
  it("AC-9/10/11/7, EC-6/7: step 2 waits for a PR, then lists every agent with estimates; the run needs a PR and 2 agents and shows no count until then", async () => {
    const user = userEvent();
    api();
    renderView();

    expect(await screen.findByRole("heading", { name: "Pull request" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agents to run" })).toBeInTheDocument();
    // AC-9 / AC-11: placeholder, disabled button, no count.
    expect(await screen.findByText("Pick a pull request first")).toBeInTheDocument();
    expect(runButton("Run multi-agent review")).toBeDisabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    // AC-10: one card per agent; enabled checked, disabled unchecked + tag; description + estimate.
    await selectPr();
    expect(await screen.findByText("8.2s · $0.06")).toBeInTheDocument();
    expect(screen.getByText("Finds security bugs")).toBeInTheDocument();
    expect(box(/Security Reviewer/)).toBeChecked();
    expect(box(/Style Reviewer/)).toBeChecked();
    expect(box(/Legacy Reviewer/)).not.toBeChecked();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument(); // EC-6
    expect(runButton("Run multi-agent review (2)")).toBeEnabled();
    // AC-7 / EC-7
    expect(screen.getByText("≈ 12.0s · $0.06")).toBeInTheDocument();
    expect(screen.getByText("parallel")).toBeInTheDocument();
    expect(screen.getByText("partial")).toBeInTheDocument();

    // Select all, then fewer than 2 checked disables again with no count.
    await user.click(screen.getByRole("button", { name: "Select all" }));
    expect(box(/Legacy Reviewer/)).toBeChecked();
    expect(runButton("Run multi-agent review (3)")).toBeEnabled();
    await user.click(box(/Legacy Reviewer/));
    await user.click(box(/Style Reviewer/));
    expect(runButton("Run multi-agent review")).toBeDisabled();
  });

  it("AC-12, EC-5: starting posts the checked ids to the PR and opens the results page; a 409 stays on the screen with the message", async () => {
    const user = userEvent();
    let reply: ReturnType<typeof apiError> | { body: unknown } = apiError(409, "conflict");
    const calls = api({ "POST /pulls/pr1/multi-agent-run": () => reply });
    renderView();
    await selectPr();
    await user.click(await screen.findByRole("button", { name: "Run multi-agent review (2)" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A multi-agent run is already in progress for this pull request.");
    expect(nav.push).not.toHaveBeenCalled();

    reply = { body: maRun() };
    await user.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/repos/r1/multi-agent/7"));
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts.at(-1)?.body).toEqual({ agentIds: ["ag1", "ag2"] });
  });

  it("EC-8: a PR with no changed files shows the message and keeps the run disabled", async () => {
    api({ "GET /repos/r1/pulls": { body: [pr({ id: "pr1", number: 7, files_count: 0 })] } });
    renderView();
    await selectPr();
    expect(await screen.findByText("This pull request has no changed files, so there is nothing to review.")).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
  });

  it("EC-9: a merged PR shows the informational warning and still allows the run", async () => {
    api({ "GET /repos/r1/pulls": { body: [pr({ id: "pr1", number: 7, status: "merged" })] } });
    renderView();
    await selectPr();
    expect(await screen.findByText("Already merged — review is informational")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Run multi-agent review (2)" })).toBeEnabled();
  });

  it("EC-25: a running grouped child of the selected PR blocks the run; a standalone running run does not", async () => {
    api({
      "GET /pulls/pr1/runs": { body: [runSummary({ run_id: "g1", status: "running", multi_agent_run_id: "mar1" })] },
    });
    renderView();
    await selectPr();
    expect(await screen.findByText("A multi-agent run is already in progress for this pull request.")).toBeInTheDocument();
    expect(runButton()).toBeDisabled();
    cleanup();

    api({ "GET /pulls/pr1/runs": { body: [runSummary({ run_id: "s1", status: "running", multi_agent_run_id: null })] } });
    renderView();
    await selectPr();
    await waitFor(() => expect(screen.getByRole("button", { name: "Run multi-agent review (2)" })).toBeEnabled());
    expect(screen.queryByText("A multi-agent run is already in progress for this pull request.")).not.toBeInTheDocument();
  });

  it("EC-1: a workspace with no agents shows the empty state with a link to /agents instead of the list", async () => {
    api({ "GET /agents": { body: [] } });
    renderView();
    expect(await screen.findByText("No agents yet")).toBeInTheDocument();
    await userEvent().click(screen.getByRole("button", { name: "Create an agent" }));
    expect(nav.push).toHaveBeenCalledWith("/agents");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
