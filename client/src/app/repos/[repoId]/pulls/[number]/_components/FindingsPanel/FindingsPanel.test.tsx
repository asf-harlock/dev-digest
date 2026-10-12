import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

const actionMock = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: actionMock.mutate, isPending: false }),
}));

// SPEC-08, SPEC-10: the panel reads the PR's eval-case links and the agent list; each expanded
// card's control reads the finding's skills and, on a click, its draft. Mock those hooks (the
// repo's pattern) so no QueryClient is needed.
const evalMock = vi.hoisted(() => ({
  links: { data: undefined as { links: { finding_id: string; case_id: string; agent_id: string }[] } | undefined },
  agents: { data: undefined as { id: string }[] | undefined },
  skills: { data: undefined as { skills: { skill_id: string; name: string; has_case: boolean; case_id: string | null }[] } | undefined, isSuccess: false, isLoading: false, isError: false },
  requested: vi.fn(),
}));
vi.mock("../../../../../../../lib/hooks/eval", () => ({
  usePullEvalCaseLinks: () => evalMock.links,
  useEvalCaseDraft: (_id: string, enabled: boolean) => {
    if (enabled) evalMock.requested();
    return { data: undefined, isError: false, isFetching: enabled, error: null, refetch: vi.fn() };
  },
  findingCaseRejection: () => null,
}));
// SPEC-10: the card still calls `useFindingSkills` (AC-11), so the mock is retargeted to that
// hook alone (client/INSIGHTS.md 2026-10-11).
vi.mock("../../../../../../../lib/hooks/skill-eval", () => ({
  useFindingSkills: () => evalMock.skills,
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => evalMock.agents,
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(() => {
  cleanup();
  evalMock.links.data = undefined;
  evalMock.agents.data = undefined;
  evalMock.skills.data = undefined;
  evalMock.skills.isSuccess = false;
  evalMock.requested.mockReset();
  actionMock.mutate.mockReset();
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

describe("FindingsPanel keyboard shortcuts", () => {
  it("a accepts the focused finding, but not while a modal is open, whatever has focus (S1)", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    fireEvent.keyDown(window, { key: "a" });
    expect(actionMock.mutate).toHaveBeenCalledTimes(1);

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    fireEvent.keyDown(window, { key: "a" }); // focus on <body>, outside the dialog
    fireEvent.keyDown(window, { key: "d" });
    expect(actionMock.mutate).toHaveBeenCalledTimes(1);
    modal.remove();
    fireEvent.keyDown(window, { key: "d" });
    expect(actionMock.mutate).toHaveBeenCalledTimes(2);
  });
});

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

describe("FindingsPanel eval case (SPEC-08, SPEC-10)", () => {
  const ACCEPTED: FindingRecord = { ...FINDINGS[0]!, accepted_at: "2026-09-17T00:00:00Z" };
  const noSkills = () => {
    evalMock.skills.data = { skills: [] };
    evalMock.skills.isSuccess = true;
  };

  it("AC-1: an accepted finding of an existing agent can be turned into an eval case; the click reads its draft", () => {
    evalMock.agents.data = [{ id: "ag1" }];
    noSkills();
    renderWithIntl(<FindingsPanel findings={[ACCEPTED]} prId="pr1" agentId="ag1" />);
    const btn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(btn).toBeEnabled();
    expect(evalMock.requested).not.toHaveBeenCalled();
    fireEvent.click(btn);
    expect(evalMock.requested).toHaveBeenCalled();
  });

  it("AC-10: the card has no Turn into skill eval case menu", () => {
    evalMock.agents.data = [{ id: "ag1" }];
    noSkills();
    renderWithIntl(<FindingsPanel findings={[ACCEPTED]} prId="pr1" agentId="ag1" />);
    expect(screen.queryByRole("button", { name: /skill eval case/i })).not.toBeInTheDocument();
  });

  it("EC-1: an undecided finding cannot be turned into a case", () => {
    evalMock.agents.data = [{ id: "ag1" }];
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" agentId="ag1" />);
    expect(screen.getByRole("button", { name: /Turn into eval case/ })).toBeDisabled();
  });

  it("EC-3: a finding whose agent was deleted and whose review recorded no skill is disabled with the reason", () => {
    evalMock.agents.data = [{ id: "other" }];
    noSkills();
    renderWithIntl(<FindingsPanel findings={[ACCEPTED]} prId="pr1" agentId="ag1" />);
    const btn = screen.getByRole("button", { name: /Turn into eval case/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("The agent that produced this finding was deleted");
  });

  it("AC-11: a finding whose agent and skills all have a case shows an In eval set link to the first owner's Evals tab", () => {
    evalMock.agents.data = [{ id: "ag1" }];
    evalMock.links.data = { links: [{ finding_id: "f1", case_id: "c1", agent_id: "ag1" }] };
    noSkills();
    renderWithIntl(<FindingsPanel findings={[ACCEPTED]} prId="pr1" agentId="ag1" />);
    expect(screen.getByRole("link", { name: /In eval set/ })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(screen.queryByRole("button", { name: /Turn into eval case/ })).not.toBeInTheDocument();
  });
});
