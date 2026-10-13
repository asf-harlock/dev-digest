/* RunReviewDropdown.test.tsx — the "Run Review" trigger. SPEC-11 AC-1/AC-4: it opens the
   multi-agent popover and the original single-run actions keep POSTing /pulls/:id/review.
   `fetch` is the outside world; hooks, api.ts and react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../../messages/en/prReview.json";
import { agent, estimate, stubApi, userEvent } from "../../../../../../../test/multi-agent-fixtures";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({ repoId: "r1", number: "7" }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const api = (extra: Parameters<typeof stubApi>[0] = {}) =>
  stubApi({
    "GET /agents": { body: [agent({ id: "a1", name: "Security" }), agent({ id: "a2", name: "Style" })] },
    "GET /multi-agent/estimates": { body: { agents: [estimate({ agent_id: "a1" })] } },
    "GET /pulls/pr1/runs": { body: [] },
    ...extra,
  });

describe("RunReviewDropdown", () => {
  it("renders the trigger label and keeps the popover closed", () => {
    api();
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("AC-1: the trigger opens the 'Pick agents to run' popover; Escape closes it", async () => {
    api();
    renderWithIntl(<RunReviewDropdown prId="pr1" />);

    await userEvent().click(screen.getByRole("button", { name: /Run Review/ }));
    expect(await screen.findByRole("dialog", { name: "Pick agents to run" })).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: /Security/ })).toBeChecked();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("AC-4: 'Run all enabled agents' and 'Run only this' still POST /pulls/:id/review and hand the run ids up", async () => {
    const calls = api({
      "POST /pulls/pr1/review": {
        body: { runs: [{ run_id: "run-1", agent_id: "a1", agent_name: "Security" }], reviews: [] },
      },
    });
    const onRunsStarted = vi.fn();
    const onRunStart = vi.fn();
    const onRunSettled = vi.fn();
    renderWithIntl(
      <RunReviewDropdown prId="pr1" onRunsStarted={onRunsStarted} onRunStart={onRunStart} onRunSettled={onRunSettled} />,
    );
    const user = userEvent();

    await user.click(screen.getByRole("button", { name: /Run Review/ }));
    await user.click(await screen.findByRole("button", { name: "Run all enabled agents" }));
    await waitFor(() => expect(onRunsStarted).toHaveBeenCalledWith(["run-1"]));
    expect(onRunStart).toHaveBeenCalledTimes(1);
    expect(onRunSettled).toHaveBeenCalledTimes(1);
    expect(calls.find((c) => c.url === "/pulls/pr1/review")?.body).toEqual({ all: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /Run Review/ }));
    await user.click(await screen.findByRole("button", { name: "Run only Style" }));
    await waitFor(() => expect(onRunSettled).toHaveBeenCalledTimes(2));
    expect(calls.filter((c) => c.method === "POST").map((c) => c.body)).toEqual([{ all: true }, { agentId: "a2" }]);
  });

  it("EC-9: a merged PR dims the trigger with the tooltip, the popover leads with the warning, the run stays allowed", async () => {
    api();
    renderWithIntl(<RunReviewDropdown prId="pr1" warnMerged />);
    expect(screen.getByTitle(/already merged/i)).toBeInTheDocument();
    await userEvent().click(screen.getByRole("button", { name: /Run Review/ }));
    expect(await screen.findByText("Already merged — review is informational")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /^Run multi-agent review \(2\)/ })).toBeEnabled());
  });
});
