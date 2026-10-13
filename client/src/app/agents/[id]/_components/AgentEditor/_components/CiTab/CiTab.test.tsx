/* CiTab.test.tsx — SPEC-11 CI tab of the agent editor (AC-35..AC-44, AC-53, EC-31, EC-33, UI-11).
   The CI hooks and the wizard are mocked; this file checks what the tab renders and asks for. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation, CiRun } from "@devdigest/shared";
import ciMessages from "../../../../../../../../messages/en/ci.json";

const mocks = vi.hoisted(() => ({
  installations: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
  runs: { data: [] as unknown[], isLoading: false, isError: false, refetch: vi.fn() },
  useCiRuns: vi.fn(),
  autoRefresh: { isRefreshing: false, isError: false },
  autoRefreshArgs: vi.fn(),
  refresh: { mutate: vi.fn(), isPending: false, isSuccess: false },
  updateMutate: vi.fn(),
  update: { isPending: false, variables: undefined as unknown },
}));

vi.mock("@/lib/hooks/ci", () => ({
  useAgentCiInstallations: () => mocks.installations,
  useAutoRefreshCi: (installations: unknown) => {
    mocks.autoRefreshArgs(installations);
    return mocks.autoRefresh;
  },
  useRefreshCi: () => mocks.refresh,
  useCiRuns: (filters: unknown) => {
    mocks.useCiRuns(filters);
    return mocks.runs;
  },
}));
vi.mock("@/lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ ...mocks.update, mutate: mocks.updateMutate }),
}));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock("../../../ExportWizard", () => ({
  ExportWizard: (props: { open: boolean; initial?: unknown; onClose: () => void }) =>
    props.open ? (
      <div role="dialog" aria-label="wizard" data-initial={JSON.stringify(props.initial ?? null)}>
        <button type="button" onClick={props.onClose}>
          close wizard
        </button>
      </div>
    ) : null,
}));

import { CiTab } from "./CiTab";

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "",
  provider: "openrouter",
  model: "gpt-4.1",
  system_prompt: "x",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 2,
};

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
    agent_version: 2,
    post_as: "github_review",
    triggers: ["opened", "synchronize"],
    ci_fail_on: "critical",
    installed_at: "2026-10-01T10:00:00Z",
    last_refreshed_at: "2026-10-01T10:00:00Z",
    update_available: false,
    last_run: { status: "succeeded", ran_at: "2026-10-01T10:00:00Z" },
    ...over,
  };
}

function run(over: Partial<CiRun> = {}): CiRun {
  return {
    id: "r1",
    installation_id: "i1",
    repo: "acme/payments-api",
    agent_name: "Security Reviewer",
    pr_number: 42,
    status: "succeeded",
    verdict: "approve",
    failure_reason: null,
    findings_count: 3,
    critical: 1,
    warning: 1,
    suggestion: 1,
    cost_usd: 0,
    duration_ms: 1200,
    ran_at: "2026-10-01T10:00:00Z",
    job_url: "https://github.com/acme/payments-api/actions/runs/1",
    ...over,
  };
}

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
      <CiTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.installations = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  mocks.runs = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
  mocks.autoRefresh = { isRefreshing: false, isError: false };
  mocks.refresh = { mutate: vi.fn(), isPending: false, isSuccess: false };
  mocks.update = { isPending: false, variables: undefined };
  mocks.updateMutate.mockClear();
  mocks.useCiRuns.mockClear();
  mocks.autoRefreshArgs.mockClear();
});
afterEach(cleanup);

const wizardInitial = () => JSON.parse(screen.getByRole("dialog", { name: "wizard" }).dataset.initial ?? "null");

describe("CiTab — empty state (AC-38, AC-1)", () => {
  it("AC-38: shows 'Not deployed to CI yet' and Add to CI, which opens the wizard with no preset", () => {
    renderTab();
    expect(screen.getByText("Not deployed to CI yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Update CI config" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to CI" }));
    expect(wizardInitial()).toBeNull();
  });
});

describe("CiTab — installations (AC-37, AC-39, AC-43, EC-33)", () => {
  beforeEach(() => {
    mocks.installations.data = [
      installation(),
      installation({
        id: "i2",
        repo: "acme/billing-worker",
        status: "pending_pr",
        last_run: null,
        update_available: true,
        workflow_version: 1,
      }),
    ];
  });

  it("AC-37: counts only active installations in the badge", () => {
    renderTab();
    expect(screen.getByText("Active in 1 repo")).toBeInTheDocument();
  });

  it("AC-39/EC-33: a row shows repo, target, workflow version, status and time; a pending row shows 'Pending PR' and an em dash", () => {
    renderTab();
    const rows = within(screen.getByRole("list", { name: "CI installations" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("acme/payments-api")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("GitHub Actions")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Workflow v1")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("succeeded")).toBeInTheDocument();
    expect(within(rows[0]!).queryByText("Update available")).not.toBeInTheDocument();
    expect(within(rows[1]!).getByText("Pending PR")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("—")).toBeInTheDocument();
  });

  it("AC-43: marks a row whose update is available", () => {
    renderTab();
    const rows = within(screen.getByRole("list", { name: "CI installations" })).getAllByRole("listitem");
    expect(within(rows[1]!).getByText("Update available")).toBeInTheDocument();
  });
});

describe("CiTab — history (AC-40, UI-11)", () => {
  beforeEach(() => {
    mocks.installations.data = [installation(), installation({ id: "i2", repo: "acme/billing-worker" })];
  });

  it("AC-40: nothing is fetched until a row is selected, then the 50 newest runs of that installation load", () => {
    mocks.runs.data = [run()];
    renderTab();
    expect(mocks.useCiRuns).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /acme\/billing-worker/ }));
    expect(mocks.useCiRuns).toHaveBeenCalledWith({ installation_id: "i2", limit: 50 });
    expect(screen.getByText("Latest runs in acme/billing-worker")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#42" })).toHaveAttribute(
      "href",
      "https://github.com/acme/billing-worker/pull/42",
    );
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("UI-11: a job link that is not an https github.com URL is not rendered as a link", () => {
    mocks.runs.data = [run({ job_url: "javascript:alert(1)" })];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /acme\/payments-api/ }));
    expect(screen.queryByRole("link", { name: "View job" })).not.toBeInTheDocument();
  });

  it("UI-11: a job link must point at this installation's repository", () => {
    mocks.runs.data = [
      run({ id: "ok", job_url: "https://github.com/acme/payments-api/actions/runs/1" }),
      run({ id: "other", pr_number: 43, job_url: "https://github.com/evil/repo/actions/runs/1" }),
    ];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /acme\/payments-api/ }));
    expect(screen.getAllByRole("link", { name: "View job" })).toHaveLength(1);
  });

  it("the history scroller is a containing block for its sr-only spans, so they cannot widen the page", () => {
    mocks.runs.data = [run()];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /acme\/payments-api/ }));
    const scroller = screen.getByRole("table").parentElement as HTMLElement;
    expect(scroller.style.overflowX).toBe("auto");
    expect(scroller.style.position).toBe("relative");
    expect(scroller.querySelector("span[style*='position: absolute']")).not.toBeNull();
  });

  it("shows an empty message when the installation has no runs", () => {
    mocks.runs.data = [];
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /acme\/payments-api/ }));
    expect(screen.getByText("No CI runs yet for this repository.")).toBeInTheDocument();
  });
});

describe("CiTab — Fail CI on (AC-41, AC-42)", () => {
  it("AC-41/AC-42: marks the agent's value with aria-pressed and saves another one through the agent update, without submitting", () => {
    renderTab();
    const group = screen.getByRole("group", { name: "Fail CI on" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Never", "Critical", "Warning +", "Any"]);
    expect(within(group).getByRole("button", { name: "Critical" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Never" })).toHaveAttribute("aria-pressed", "false");
    for (const b of buttons) expect(b).toHaveAttribute("type", "button");

    fireEvent.click(within(group).getByRole("button", { name: "Warning +" }));
    expect(mocks.updateMutate).toHaveBeenCalledTimes(1);
    expect(mocks.updateMutate.mock.calls[0]![0]).toEqual({ id: "ag1", patch: { ci_fail_on: "warning" } });
  });

  it("does not save when the current value is clicked again", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    expect(mocks.updateMutate).not.toHaveBeenCalled();
  });
});

describe("CiTab — wizard entry points (AC-35, AC-44)", () => {
  beforeEach(() => {
    mocks.installations.data = [
      installation(),
      installation({ id: "i2", repo: "acme/billing-worker", triggers: ["reopened"], post_as: "none" }),
    ];
  });

  it("AC-35: Update CI config acts on the first installation when none is selected, repo locked", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Update CI config" }));
    expect(wizardInitial()).toEqual({
      repo: "acme/payments-api",
      lockedRepo: true,
      triggers: ["opened", "synchronize"],
      post_as: "github_review",
    });
  });

  it("AC-35: Update CI config acts on the selected installation", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /acme\/billing-worker/ }));
    fireEvent.click(screen.getByRole("button", { name: "Update CI config" }));
    expect(wizardInitial()).toEqual({
      repo: "acme/billing-worker",
      lockedRepo: true,
      triggers: ["reopened"],
      post_as: "none",
    });
  });

  it("AC-44: + Add repository opens the wizard with no repository preselected", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Add repository" }));
    expect(wizardInitial()).toEqual({ repo: "", lockedRepo: false });
  });

  it("closing the wizard removes it", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Add to CI" }));
    fireEvent.click(screen.getByRole("button", { name: "close wizard" }));
    expect(screen.queryByRole("dialog", { name: "wizard" })).not.toBeInTheDocument();
  });
});

describe("CiTab — refresh (AC-53, EC-31)", () => {
  it("EC-31: a failed auto refresh keeps the rows and offers Retry, which forces a refresh", () => {
    mocks.installations.data = [installation()];
    mocks.autoRefresh = { isRefreshing: false, isError: true };
    renderTab();
    expect(screen.getByRole("status")).toHaveTextContent("Couldn’t refresh the CI results");
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refresh.mutate).toHaveBeenCalledWith({ force: true });
  });
});

describe("CiTab — load states", () => {
  it("shows an error with Retry when the installations cannot be loaded", () => {
    mocks.installations.isError = true;
    renderTab();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load the CI installations");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.installations.refetch).toHaveBeenCalled();
  });
});

describe("CiTab — added SPEC-11 coverage", () => {
  it("AC-37: the badge reads 'Active in 0 repos' while nothing is active, and plural for several", () => {
    mocks.installations.data = [installation({ status: "pending_pr", last_run: null })];
    const { unmount } = renderTab();
    expect(screen.getByRole("heading", { name: "CI deployment" })).toBeInTheDocument();
    expect(screen.getByText("Active in 0 repos")).toBeInTheDocument();
    unmount();

    mocks.installations.data = [installation(), installation({ id: "i2", repo: "acme/web" })];
    renderTab();
    expect(screen.getByText("Active in 2 repos")).toBeInTheDocument();
  });

  it("AC-39: a row with a run shows that run's relative time, not an em dash", () => {
    const recent = new Date(Date.now() - 2 * 3_600_000).toISOString();
    mocks.installations.data = [installation({ last_run: { status: "failed", ran_at: recent } })];
    renderTab();
    const row = within(screen.getByRole("list", { name: "CI installations" })).getAllByRole("listitem")[0]!;
    expect(within(row).getByText("failed")).toBeInTheDocument();
    expect(within(row).getByText(/2h ago|2 hours ago/)).toBeInTheDocument();
    expect(within(row).queryByText("—")).not.toBeInTheDocument();
  });

  it("EC-33: a manual installation with no run shows 'Manual' and an em dash for the time", () => {
    mocks.installations.data = [installation({ status: "manual", last_run: null })];
    renderTab();
    const row = within(screen.getByRole("list", { name: "CI installations" })).getAllByRole("listitem")[0]!;
    expect(within(row).getByText("Manual")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("AC-53: opening the tab starts the auto refresh with the agent's installations", () => {
    mocks.installations.data = [installation({ last_refreshed_at: null })];
    renderTab();
    expect(mocks.autoRefreshArgs).toHaveBeenCalled();
    const arg = mocks.autoRefreshArgs.mock.calls.at(-1)![0] as CiInstallation[];
    expect(arg.map((i) => i.id)).toEqual(["i1"]);
  });

  it("AC-40: selecting the same row again hides the history and falls back to the hint", () => {
    mocks.installations.data = [installation()];
    mocks.runs.data = [run()];
    renderTab();
    expect(screen.getByText("Select a repository to see its latest CI runs.")).toBeInTheDocument();
    const row = screen.getByRole("button", { name: /acme\/payments-api/ });
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Latest runs in acme/payments-api")).toBeInTheDocument();
    fireEvent.click(row);
    expect(screen.queryByText("Latest runs in acme/payments-api")).not.toBeInTheDocument();
  });

  it("AC-42: the segment being saved shows as pressed immediately and the control is disabled until it settles", () => {
    mocks.update = { isPending: true, variables: { id: "ag1", patch: { ci_fail_on: "any" } } };
    renderTab();
    const group = screen.getByRole("group", { name: "Fail CI on" });
    expect(within(group).getByRole("button", { name: "Any" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Critical" })).toHaveAttribute("aria-pressed", "false");
    for (const b of within(group).getAllByRole("button")) expect(b).toBeDisabled();
  });

  it("NFR-15: no 'Publish to CI' or 'Requires a GitHub App' text, and the strings come from ci.json", () => {
    renderTab();
    expect(screen.queryByText(/Publish to CI|Requires a GitHub App/)).not.toBeInTheDocument();
    expect(JSON.stringify(ciMessages)).not.toMatch(/Publish to CI|Requires a GitHub App/);
    expect(screen.getByRole("button", { name: ciMessages.ciTab.addToCi })).toBeInTheDocument();
  });
});
