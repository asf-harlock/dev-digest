/* MultiAgentPopover.test.tsx — SPEC-11 popover on the PR page (AC-1…AC-4, AC-6, AC-7, AC-12, AC-47,
   EC-1, EC-5, EC-6, EC-7, EC-9, EC-25). `fetch` is the outside world; hooks, api.ts and react-query
   are real. Only navigation is stubbed. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import prReview from "../../../../../../../../messages/en/prReview.json";
import { agent, apiError, estimate, maRun, runSummary, stubApi, userEvent } from "../../../../../../../test/multi-agent-fixtures";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useParams: () => ({ repoId: "r1", number: "7" }),
}));

import { MultiAgentPopover } from "./MultiAgentPopover";

beforeEach(() => nav.push.mockReset());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENTS = [
  agent({ id: "ag1", name: "Security Reviewer" }),
  agent({ id: "ag2", name: "Style Reviewer" }),
  agent({ id: "ag3", name: "Legacy Reviewer", enabled: false }),
];
const ESTIMATES = {
  agents: [
    estimate({ agent_id: "ag1", duration_ms: 8200, cost_usd: 0.06 }),
    estimate({ agent_id: "ag2", duration_ms: 12000, cost_usd: null }),
    estimate({ agent_id: "ag3", duration_ms: null, cost_usd: null, runs_used: 0 }),
  ],
};

function api(over: Record<string, Parameters<typeof stubApi>[0][string]> = {}) {
  return stubApi({
    "GET /agents": { body: AGENTS },
    "GET /multi-agent/estimates": { body: ESTIMATES },
    "GET /pulls/pr1/runs": { body: [] },
    ...over,
  });
}

function renderPopover(props: Partial<React.ComponentProps<typeof MultiAgentPopover>> = {}) {
  const handlers = { onClose: vi.fn(), onRunAll: vi.fn(), onRunOne: vi.fn() };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview }}>
        <MultiAgentPopover prId="pr1" {...handlers} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return handlers;
}

const runButton = (n: number) => screen.getByRole("button", { name: new RegExp(`^Run multi-agent review \\(${n}\\)`) });
const box = (name: RegExp) => screen.getByRole("checkbox", { name });

describe("MultiAgentPopover", () => {
  it("AC-1/2/3/6/7/47, EC-6/7: enabled agents start checked, estimates and the parallel total show, Clear and N<2 disable the run", async () => {
    const user = userEvent();
    api();
    renderPopover();

    expect(await screen.findByText("8.2s · $0.06")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pick agents to run" })).toBeInTheDocument();
    // AC-2: enabled checked, disabled unchecked with a label.
    expect(box(/Security Reviewer/)).toBeChecked();
    expect(box(/Style Reviewer/)).toBeChecked();
    expect(box(/Legacy Reviewer/)).not.toBeChecked();
    expect(screen.getByText("disabled")).toBeInTheDocument();
    // EC-6: an agent without a completed run shows a dash, never 0.0s.
    expect(screen.getByText("—")).toBeInTheDocument();
    // AC-7 / EC-7: max duration, sum of the known costs, "parallel", and "partial" (Style's cost unknown).
    expect(runButton(2)).toBeEnabled();
    expect(screen.getByText("≈ 12.0s · $0.06")).toBeInTheDocument();
    expect(screen.getByText("parallel")).toBeInTheDocument();
    expect(screen.getByText("partial")).toBeInTheDocument();

    // AC-47: below 2 the button is disabled and says why.
    await user.click(box(/Style Reviewer/));
    expect(runButton(1)).toBeDisabled();
    expect(screen.getByText("Select at least 2 agents.")).toBeInTheDocument();
    await user.click(box(/Legacy Reviewer/));
    expect(runButton(2)).toBeEnabled();

    // AC-3: Clear unchecks everything and N reads 0.
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(box(/Security Reviewer/)).not.toBeChecked();
    expect(box(/Legacy Reviewer/)).not.toBeChecked();
    expect(runButton(0)).toBeDisabled();
  });

  it("AC-12: starting posts the checked agent ids, closes the popover and opens the results page", async () => {
    const user = userEvent();
    const calls = api({ "POST /pulls/pr1/multi-agent-run": { body: maRun() } });
    const { onClose } = renderPopover();

    await user.click(await screen.findByRole("button", { name: /^Run multi-agent review \(2\)/ }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/repos/r1/multi-agent/7"));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ agentIds: ["ag1", "ag2"] });
    expect(onClose).toHaveBeenCalled();
  });

  it("EC-5: a 409 shows the in-progress message inline (branching on status) and does not navigate; another failure says so", async () => {
    const user = userEvent();
    let reply = apiError(409, "conflict");
    api({ "POST /pulls/pr1/multi-agent-run": () => reply });
    renderPopover();

    await user.click(await screen.findByRole("button", { name: /^Run multi-agent review \(2\)/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A multi-agent run is already in progress for this pull request.");
    expect(nav.push).not.toHaveBeenCalled();

    reply = apiError(500, "internal");
    await user.click(screen.getByRole("button", { name: /^Run multi-agent review \(2\)/ }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t start the multi-agent run. Try again."));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("EC-25: a running grouped child of this PR disables the run; a standalone running run does not", async () => {
    api({ "GET /pulls/pr1/runs": { body: [runSummary({ run_id: "s1", status: "running", multi_agent_run_id: null })] } });
    renderPopover();
    await screen.findByText("8.2s · $0.06");
    await waitFor(() => expect(runButton(2)).toBeEnabled());
    cleanup();

    api({ "GET /pulls/pr1/runs": { body: [runSummary({ run_id: "g1", status: "running", multi_agent_run_id: "mar1" })] } });
    renderPopover();
    await screen.findByText("8.2s · $0.06");
    await waitFor(() => expect(runButton(2)).toBeDisabled());
    expect(screen.getByText("A multi-agent run is already in progress for this pull request.")).toBeInTheDocument();
  });

  it("AC-4: the single-run actions stay — Run all enabled, Run only this, Configure agents", async () => {
    const user = userEvent();
    api();
    const { onRunAll, onRunOne, onClose } = renderPopover();
    await screen.findByText("8.2s · $0.06");

    await user.click(screen.getByRole("button", { name: "Run only Style Reviewer" }));
    expect(onRunOne).toHaveBeenCalledWith("ag2");

    await user.click(screen.getByRole("button", { name: "Run all enabled agents" }));
    expect(onRunAll).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Configure agents…" }));
    expect(nav.push).toHaveBeenCalledWith("/agents");
    expect(onClose).toHaveBeenCalled();
  });

  it("EC-1: a workspace with no agents shows the empty state with a way to /agents", async () => {
    const user = userEvent();
    api({ "GET /agents": { body: [] } });
    renderPopover();

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("No agents yet")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Create an agent" }));
    expect(nav.push).toHaveBeenCalledWith("/agents");
  });

  it("EC-9: a merged/closed PR leads with the informational warning and still allows the run", async () => {
    api();
    renderPopover({ warnMerged: true });
    expect(await screen.findByText("Already merged — review is informational")).toBeInTheDocument();
    await waitFor(() => expect(runButton(2)).toBeEnabled());
  });
});
