/* CiRunsView.test.tsx — /ci-runs (AC-46..AC-53, EC-29..EC-31, EC-37, UI-11, UI-12).
   `fetch` is the outside world; AppShell is stubbed. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CiInstallation, CiRun } from "@devdigest/shared";
import ciMessages from "../../../../../messages/en/ci.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CiRunsView } from "./CiRunsView";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date().toISOString();

function run(over: Partial<CiRun> = {}): CiRun {
  return {
    id: "r1",
    installation_id: "i1",
    repo: "acme/payments-api",
    agent_name: "Security Reviewer",
    pr_number: 12,
    status: "succeeded",
    verdict: "comment",
    failure_reason: null,
    findings_count: 3,
    critical: 1,
    warning: 1,
    suggestion: 1,
    cost_usd: 0.12,
    duration_ms: 65_000,
    ran_at: NOW,
    job_url: "https://github.com/acme/payments-api/actions/runs/99",
    ...over,
  };
}

function installation(over: Partial<CiInstallation> = {}): CiInstallation {
  return {
    id: "i1",
    agent_id: "ag1",
    agent_name: "Security Reviewer",
    repo: "acme/payments-api",
    target_type: "gha",
    status: "active",
    pr_url: null,
    workflow_version: 1,
    agent_version: 1,
    post_as: "github_review",
    triggers: ["opened", "synchronize"],
    ci_fail_on: "critical",
    installed_at: NOW,
    last_refreshed_at: NOW,
    update_available: false,
    last_run: null,
    ...over,
  };
}

interface Setup {
  runs: CiRun[];
  installations?: CiInstallation[];
  refresh?: () => { status: number; body: unknown };
}

function stub({ runs, installations = [installation()], refresh }: Setup) {
  const calls: { method: string; url: string; body?: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ method: init?.method ?? "GET", url, body: init?.body as string | undefined });
      let status = 200;
      let body: unknown = [];
      if (url.includes("/ci/refresh")) ({ status, body } = refresh?.() ?? { status: 200, body: [] });
      else if (url.includes("/ci/installations")) body = installations;
      else if (url.includes("/ci/runs")) body = runs;
      return { ok: status < 300, status, statusText: "", json: async () => body } as Response;
    }) as unknown as typeof fetch,
  );
  return calls;
}

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <CiRunsView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CiRunsView", () => {
  it("AC-46/AC-48/AC-49/EC-29/EC-37/UI-11/UI-12: lists runs with verdict, dashes for missing values, a trusted job link only, and counts as text", async () => {
    stub({
      runs: [
        run(),
        run({
          id: "r2",
          pr_number: 13,
          verdict: null,
          status: "failed",
          failure_reason: "no_artifact",
          findings_count: null,
          cost_usd: null,
          duration_ms: null,
          job_url: "https://evil.example/acme/payments-api/actions/runs/1",
        }),
        run({ id: "r3", pr_number: 14, verdict: "approve", status: "no_findings", cost_usd: 0, findings_count: 0 }),
      ],
    });
    renderView();

    expect(await screen.findByText("Comment")).toBeInTheDocument();
    expect(screen.getByText(/reported by each repository's own workflow/i)).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);

    const first = within(rows[0]!);
    expect(first.getByRole("link", { name: /pull request #12/i })).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/12");
    const job = first.getByRole("link", { name: /workflow run/i });
    expect(job).toHaveAttribute("href", "https://github.com/acme/payments-api/actions/runs/99");
    expect(job).toHaveAttribute("target", "_blank");
    expect(job).toHaveAttribute("rel", "noopener noreferrer");
    expect(first.getByTitle("1 critical, 1 warning, 1 suggestion")).toBeInTheDocument();
    expect(first.getByText("$0.12")).toBeInTheDocument();
    expect(first.getByText("1m 5s")).toBeInTheDocument();

    const failed = within(rows[1]!);
    expect(failed.getByText("Failed")).toBeInTheDocument();
    expect(failed.getByText("No result uploaded")).toBeInTheDocument();
    expect(failed.queryByRole("link", { name: /workflow run/i })).not.toBeInTheDocument();
    expect(failed.queryByText("$0.00")).not.toBeInTheDocument();
    expect(failed.getAllByText("—").length).toBeGreaterThanOrEqual(4);

    expect(within(rows[2]!).getByText("$0.00")).toBeInTheDocument();

    // The scroller is a containing block for the sr-only spans, so they cannot widen the page.
    const scroller = screen.getByRole("table").parentElement as HTMLElement;
    expect(scroller.style.overflowX).toBe("auto");
    expect(scroller.style.position).toBe("relative");
    expect(scroller.querySelector("span[style*='position: absolute']")).not.toBeNull();
  });

  it("EC-30: shows the empty state when the workspace has no CI run", async () => {
    stub({ runs: [], installations: [] });
    renderView();
    expect(await screen.findByText("No CI runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("AC-53: refreshes a never-refreshed installation on open, and filters by agent through the query", async () => {
    const calls = stub({
      runs: [run()],
      installations: [installation({ last_refreshed_at: null })],
    });
    renderView();
    await screen.findByText("Comment");

    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/ci/refresh"))).toBe(true));
    const auto = calls.find((c) => c.url.endsWith("/ci/refresh"))!;
    expect(JSON.parse(auto.body!)).toEqual({ installation_id: "i1", force: false });

    fireEvent.change(screen.getByRole("combobox", { name: /filter by agent/i }), { target: { value: "ag1" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("/ci/runs?") && c.url.includes("agent_id=ag1"))).toBe(true));
  });

  it("EC-31: keeps the stored rows and offers Retry when a refresh reports a failure", async () => {
    let failing = true;
    const calls = stub({
      runs: [run()],
      refresh: () =>
        failing
          ? {
              status: 200,
              body: [{ installation_id: "i1", status: "failed", added: 0, updated: 0, skipped: 0, failure: { code: "rate_limited" } }],
            }
          : { status: 200, body: [] },
    });
    renderView();
    await screen.findByText("Comment");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/showing stored results/i);
    expect(alert).toHaveTextContent(/rate limit/i);
    expect(screen.getByText("Comment")).toBeInTheDocument();

    failing = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    const bodies = calls.filter((c) => c.url.endsWith("/ci/refresh")).map((c) => JSON.parse(c.body!));
    expect(bodies.every((b) => b.force === true)).toBe(true);
  });

  it("AC-46: shows the nine columns in order, keeps the server's newest-first order, and asks for at most 200", async () => {
    const calls = stub({
      runs: [run({ id: "n", pr_number: 30 }), run({ id: "o", pr_number: 20 })],
    });
    renderView();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual([
      "Repository",
      "Pull request",
      "Agent",
      "Verdict",
      "Findings",
      "Cost",
      "Duration",
      "Run time",
      "Job",
    ]);
    const links = screen.getAllByRole("link", { name: /pull request #/i }).map((a) => a.textContent);
    expect(links).toEqual(["#30", "#20"]);
    expect(calls.find((c) => c.url.includes("/ci/runs"))!.url).toContain("limit=200");
    expect(screen.getByRole("table")).toHaveAccessibleName("CI runs, newest first");
  });

  it("AC-47: shows all three verdicts as text, and a running run without a verdict as Running with no time", async () => {
    stub({
      runs: [
        run({ id: "a", verdict: "request_changes", pr_number: 1 }),
        run({ id: "b", verdict: "approve", pr_number: 2 }),
        run({ id: "c", verdict: "comment", pr_number: 3 }),
        run({
          id: "d",
          pr_number: 4,
          verdict: null,
          status: "running",
          ran_at: null,
          findings_count: null,
          cost_usd: null,
          duration_ms: null,
        }),
      ],
    });
    renderView();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(5));
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByText("Request changes")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Approve")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Comment")).toBeInTheDocument();
    expect(within(rows[3]!).getByText("Running")).toBeInTheDocument();
    expect(within(rows[3]!).queryByRole("time")).not.toBeInTheDocument();
  });

  it("AC-48: the findings total carries the severity counts as hover text and as screen-reader text", async () => {
    stub({ runs: [run()] });
    renderView();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    const cell = within(screen.getAllByRole("row")[1]!).getByTitle("1 critical, 1 warning, 1 suggestion");
    expect(cell).toHaveTextContent("3");
    expect(cell).toHaveTextContent("(1 critical, 1 warning, 1 suggestion)");
  });

  it("AC-50: filters by repository and by status through the query", async () => {
    const calls = stub({
      runs: [run()],
      installations: [
        installation({ id: "i1", repo: "acme/payments-api" }),
        installation({ id: "i2", repo: "acme/web", agent_id: "ag2", agent_name: "Style Cop", last_refreshed_at: NOW }),
      ],
    });
    renderView();
    await screen.findByText("Comment");

    const repoSelect = screen.getByRole("combobox", { name: /filter by repository/i });
    expect(within(repoSelect).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "All repositories",
      "acme/payments-api",
      "acme/web",
    ]);
    fireEvent.change(repoSelect, { target: { value: "acme/web" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("/ci/runs?") && c.url.includes("repo=acme%2Fweb"))).toBe(true));

    fireEvent.change(screen.getByRole("combobox", { name: /filter by status/i }), { target: { value: "failed" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("status=failed") && c.url.includes("repo=acme%2Fweb"))).toBe(true));
  });

  it("AC-50: a filter that matches nothing says so instead of showing the empty state", async () => {
    stub({ runs: [run()] });
    renderView();
    await screen.findByText("Comment");
    // Re-stub so the filtered query answers with no rows.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.includes("/ci/installations") ? [installation()] : url.includes("/ci/runs") ? [] : [];
        return { ok: true, status: 200, statusText: "", json: async () => body } as Response;
      }) as unknown as typeof fetch,
    );
    fireEvent.change(screen.getByRole("combobox", { name: /filter by status/i }), { target: { value: "failed" } });
    expect(await screen.findByText("No CI runs match these filters.")).toBeInTheDocument();
    expect(screen.queryByText("No CI runs yet")).not.toBeInTheDocument();
  });

  it("AC-51: the subtitle states that results are reported by the repository's own workflow", async () => {
    stub({ runs: [] });
    renderView();
    expect(await screen.findByText("Results are reported by each repository's own workflow.")).toBeInTheDocument();
  });

  it("AC-52: Refresh posts a forced refresh for every installation (no installation id)", async () => {
    const calls = stub({ runs: [run()], installations: [installation({ last_refreshed_at: NOW })] });
    renderView();
    await screen.findByText("Comment");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/ci/refresh"))).toBe(true));
    const post = calls.find((c) => c.method === "POST" && c.url.endsWith("/ci/refresh"))!;
    expect(JSON.parse(post.body!)).toEqual({ force: true });
  });

  it("AC-53: an installation refreshed a few seconds ago is not refreshed on open", async () => {
    const calls = stub({ runs: [run()], installations: [installation({ last_refreshed_at: NOW })] });
    renderView();
    await screen.findByText("Comment");
    expect(calls.some((c) => c.url.endsWith("/ci/refresh"))).toBe(false);
  });

  it("AC-63: opening the page only reads stored rows (no refresh call for a fresh installation)", async () => {
    const calls = stub({ runs: [run()], installations: [installation({ last_refreshed_at: NOW })] });
    renderView();
    await screen.findByText("Comment");
    expect(calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("EC-32: a long repository and agent name are truncated with an ellipsis and keep the full text in title and DOM", async () => {
    const longRepo = "an-organisation-with-a-long-name/an-extremely-long-repository-name-that-overflows";
    const longAgent = "A very long agent name that cannot fit into its column at all";
    stub({
      runs: [run({ repo: longRepo, agent_name: longAgent, job_url: `https://github.com/${longRepo}/actions/runs/9` })],
    });
    renderView();
    const repoEl = await screen.findByText(longRepo);
    expect(repoEl).toHaveAttribute("title", longRepo);
    expect(repoEl).toHaveStyle({ textOverflow: "ellipsis", overflow: "hidden" });
    const agentEl = screen.getByText(longAgent);
    expect(agentEl).toHaveAttribute("title", longAgent);
    expect(agentEl).toHaveStyle({ textOverflow: "ellipsis" });
  });

  it("EC-31: a refresh request that fails outright keeps the stored rows and shows a Retry", async () => {
    stub({ runs: [run()], refresh: () => ({ status: 500, body: { error: { code: "internal", message: "boom" } } }) });
    renderView();
    await screen.findByText("Comment");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/showing stored results/i);
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByText("Comment")).toBeInTheDocument();
  });
});
