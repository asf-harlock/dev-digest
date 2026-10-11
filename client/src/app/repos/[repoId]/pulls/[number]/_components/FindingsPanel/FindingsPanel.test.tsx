import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

// SPEC-08: the panel also reads the PR's eval-case links + the agent list and can
// create a case. Mock those hooks (the repo's pattern) so no QueryClient is needed.
const evalMock = vi.hoisted(() => ({
  links: { data: undefined as { links: { finding_id: string; case_id: string; agent_id: string }[] } | undefined },
  agents: { data: undefined as { id: string }[] | undefined },
  mutate: vi.fn(),
}));
vi.mock("../../../../../../../lib/hooks/eval", () => ({
  usePullEvalCaseLinks: () => evalMock.links,
  useCreateEvalCaseFromFinding: () => ({ mutate: evalMock.mutate, isPending: false, variables: undefined }),
}));
// SPEC-09: every expanded decided card also loads its skills for "Turn into skill eval
// case". Mocked the same way — setup only; no assertion of this file depends on it.
vi.mock("../../../../../../../lib/hooks/skill-eval", () => ({
  useFindingSkills: () => ({ data: undefined, isLoading: false, isError: false, isSuccess: false }),
  useCreateSkillCaseFromFinding: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => evalMock.agents,
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  evalMock.links.data = undefined;
  evalMock.agents.data = undefined;
  evalMock.mutate.mockReset();
});

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

const MANY: FindingRecord[] = [
  FINDINGS[0]!,
  { ...FINDINGS[0]!, id: "f2", title: "Second critical" },
  { ...FINDINGS[0]!, id: "f3", severity: "WARNING", title: "A warning" },
  { ...FINDINGS[0]!, id: "f4", severity: "SUGGESTION", title: "A suggestion" },
];

describe("FindingsPanel severity counters", () => {
  it("shows one counter per severity present, with its count", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    const group = screen.getByRole("group", { name: "Findings by severity" });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["Critical2", "Warning1", "Suggestion1"]);
  });

  it("hides the counter row when there are no findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Findings by severity" })).not.toBeInTheDocument();
  });

  it("clicking a severity shows only its findings; clicking again shows all", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    const critical = screen.getByTitle("Show only CRITICAL findings");

    fireEvent.click(critical);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Second critical")).toBeInTheDocument();
    expect(screen.queryByText("A warning")).not.toBeInTheDocument();
    expect(screen.queryByText("A suggestion")).not.toBeInTheDocument();
    expect(critical).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByTitle("Show all severities"));
    expect(screen.getByText("A warning")).toBeInTheDocument();
    expect(screen.getByText("A suggestion")).toBeInTheDocument();
  });

  it("keeps the totals while a filter is active", () => {
    renderWithIntl(<FindingsPanel findings={MANY} prId="pr1" />);
    fireEvent.click(screen.getByTitle("Show only WARNING findings"));
    const group = screen.getByRole("group", { name: "Findings by severity" });
    const buttons = Array.from(group.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["Critical2", "Warning1", "Suggestion1"]);
  });

  // Deliberate asymmetry: a dismissed finding stays VISIBLE in the list (struck
  // through, so you can undo it) but drops out of the counter above it.
  it("still lists a dismissed finding but does not count it", () => {
    const withDismissed: FindingRecord[] = [
      ...MANY,
      { ...FINDINGS[0]!, id: "f5", title: "Dismissed one", dismissed_at: "2026-09-17T00:00:00Z" },
    ];
    renderWithIntl(<FindingsPanel findings={withDismissed} prId="pr1" />);
    expect(screen.getByText("Dismissed one")).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Findings by severity" });
    expect(Array.from(group.querySelectorAll("button"))[0]!.textContent).toBe("Critical2");
  });
});

describe("FindingsPanel eval case (SPEC-08)", () => {
  const ACCEPTED: FindingRecord = { ...FINDINGS[0]!, accepted_at: "2026-09-17T00:00:00Z" };

  it("AC-1: an accepted finding of an existing agent can be turned into an eval case", () => {
    evalMock.agents.data = [{ id: "ag1" }];
    renderWithIntl(<FindingsPanel findings={[ACCEPTED]} prId="pr1" agentId="ag1" />);
    const btn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(evalMock.mutate).toHaveBeenCalledWith("f1", expect.anything());
  });

  it("EC-1: an undecided finding cannot be turned into a case", () => {
    evalMock.agents.data = [{ id: "ag1" }];
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" agentId="ag1" />);
    expect(screen.getByRole("button", { name: /Turn into eval case/ })).toBeDisabled();
  });

  it("EC-2: a finding whose agent was deleted is disabled with the reason", () => {
    evalMock.agents.data = [{ id: "other" }];
    renderWithIntl(<FindingsPanel findings={[ACCEPTED]} prId="pr1" agentId="ag1" />);
    const btn = screen.getByRole("button", { name: /Turn into eval case/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("The agent that produced this finding was deleted");
  });

  it("AC-9: a finding that already has a case shows an In eval set link to the Evals tab", () => {
    evalMock.agents.data = [{ id: "ag1" }];
    evalMock.links.data = { links: [{ finding_id: "f1", case_id: "c1", agent_id: "ag1" }] };
    renderWithIntl(<FindingsPanel findings={[ACCEPTED]} prId="pr1" agentId="ag1" />);
    expect(screen.getByRole("link", { name: /In eval set/ })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(screen.queryByRole("button", { name: /Turn into eval case/ })).not.toBeInTheDocument();
  });
});
