/* TabsView.test.tsx — SPEC-11 Tabs mode (AC-24, AC-25, AC-28, AC-29, AC-40, EC-18, EC-23, NFR-8).
   `fetch` is the outside world; the real FindingCard, hooks and react-query run. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseDraft } from "@devdigest/shared";
import runs from "../../../../../../../../messages/en/runs.json";
import prReview from "../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import shell from "../../../../../../../../messages/en/shell.json";
import { agent, column, finding, stubApi } from "../../../../../../../test/multi-agent-fixtures";
import { TabsView } from "./TabsView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DRAFT: EvalCaseDraft = {
  name: "From finding: SQL injection",
  expectation: { type: "must_find", file: "src/a.ts", start_line: 12, end_line: 12, severity: "CRITICAL", category: "security", title: "SQL injection" },
  input_diff: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -10,1 +10,2 @@\n a\n+b",
  input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "Add retry", body: null },
  owners: [{ kind: "agent", id: "ag1", name: "Security Reviewer", has_case: false, case_id: null }],
};

const SQL = finding({
  id: "f-sql",
  severity: "CRITICAL",
  title: "SQL injection",
  file: "src/a.ts",
  start_line: 12,
  end_line: 12,
  rationale: "User input reaches the query string.",
  suggestion: "Use a parameterised query.",
  confidence: 0.91,
});
const NIT = finding({ id: "f-nit", severity: "SUGGESTION", title: "Rename helper", suggestion: null, rationale: "Clearer name." });

const COLS = [
  column({ run_id: "ra", agent_id: "ag1", agent_name: "Security Reviewer", score: 64, summary: "Two real problems.", findings: [NIT, SQL] }),
  column({ run_id: "rb", agent_id: "ag2", agent_name: "Style Reviewer", score: 90, summary: "Tidy.", findings: [] }),
  column({ run_id: "rc", agent_id: "ag3", agent_name: "Docs Reviewer", status: "failed", error: "provider 429", score: null, summary: null }),
];

function api(over: Parameters<typeof stubApi>[0] = {}) {
  return stubApi({
    "GET /pulls/pr1/eval-case-links": { body: { links: [] } },
    "GET /agents": { body: [agent({ id: "ag1" }), agent({ id: "ag2", name: "Style Reviewer" }), agent({ id: "ag3", name: "Docs Reviewer" })] },
    "GET /findings/f-sql/eval-skills": { body: { skills: [] } },
    ...over,
  });
}

function renderTabs(columns = COLS, onOpenTrace = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ runs, prReview, eval: evalMessages, shell }}>
        <TabsView columns={columns} prId="pr1" repoFullName="acme/api" headSha="abc123" onOpenTrace={onOpenTrace} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onOpenTrace;
}

const tab = (name: RegExp) => screen.getByRole("tab", { name });

describe("TabsView", () => {
  it("AC-24/25/40, EC-23: a tab per agent with name and score; the panel shows the summary card and the findings worst-first, the first one expanded with rationale, fix, confidence and the three actions", () => {
    api();
    const onOpenTrace = renderTabs();

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Security Reviewer64", "Style Reviewer90", "Docs ReviewerFailed"]);
    expect(tab(/Security Reviewer/)).toHaveAttribute("aria-selected", "true");

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Two real problems.")).toBeInTheDocument();
    // worst first: the CRITICAL finding leads and is the expanded one
    const cards = panel.querySelectorAll("[data-finding-id]");
    expect([...cards].map((c) => c.getAttribute("data-finding-id"))).toEqual(["f-sql", "f-nit"]);
    expect(within(panel).getByText("User input reaches the query string.")).toBeInTheDocument();
    expect(within(panel).getByText("Suggested fix")).toBeInTheDocument();
    expect(within(panel).getByText("Use a parameterised query.")).toBeInTheDocument();
    expect(within(panel).getByText(/91%/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Turn into eval case" })).toBeInTheDocument();

    // EC-23: a finding without a suggestion omits the Suggested fix block.
    fireEvent.click(within(panel).getByText("Rename helper"));
    expect(within(panel).getByText("Clearer name.")).toBeInTheDocument();
    expect(within(panel).getAllByText("Suggested fix")).toHaveLength(1);

    fireEvent.click(within(panel).getByRole("button", { name: "View trace of Security Reviewer" }));
    expect(onOpenTrace).toHaveBeenCalledWith("ra");
  });

  it("AC-24/22: switching tabs shows that agent; a failed agent shows its error and no findings; arrow keys move between tabs (NFR-8)", () => {
    api();
    renderTabs();
    fireEvent.click(tab(/Style Reviewer/));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Tidy.");
    expect(screen.getByText("No findings.")).toBeInTheDocument();

    fireEvent.keyDown(tab(/Style Reviewer/), { key: "ArrowRight" });
    expect(tab(/Docs Reviewer/)).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("provider 429")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();

    fireEvent.keyDown(tab(/Docs Reviewer/), { key: "ArrowRight" });
    expect(tab(/Security Reviewer/)).toHaveAttribute("aria-selected", "true");
  });

  it("AC-28: Accept and Dismiss POST to the finding's action route", async () => {
    const calls = api({
      "POST /findings/f-sql/accept": { body: { finding: { ...SQL, accepted_at: "2026-06-12T00:00:00Z" } } },
      "POST /findings/f-sql/dismiss": { body: { finding: { ...SQL, dismissed_at: "2026-06-12T00:00:00Z" } } },
    });
    renderTabs();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/findings/f-sql/accept")).toBe(true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Dismiss" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/findings/f-sql/dismiss")).toBe(true));
  });

  it("AC-29: on a decided finding Turn into eval case opens the Case Editor seeded from it; an undecided one is disabled", async () => {
    api({ "GET /findings/f-sql/eval-case-draft": { body: DRAFT } });
    renderTabs([{ ...COLS[0]!, findings: [{ ...SQL, accepted_at: "2026-06-12T00:00:00Z" }] }]);

    const button = await screen.findByRole("button", { name: "Turn into eval case" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("From finding: SQL injection");
    cleanup();

    api();
    renderTabs();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();
  });

  it("AC-29, EC-18: a deleted agent's decided finding cannot become an eval case (the agent is missing)", async () => {
    api({ "GET /findings/f-sql/eval-skills": { body: { skills: [] } } });
    renderTabs([{ ...COLS[0]!, agent_id: null, agent_name: null, findings: [{ ...SQL, dismissed_at: "2026-06-12T00:00:00Z" }] }]);
    expect(screen.getByRole("tab", { name: /Deleted agent/ })).toBeInTheDocument();
    expect(await screen.findByText("The agent that produced this finding was deleted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeDisabled();
  });
});
