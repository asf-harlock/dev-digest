import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// The control reads the finding's skills and, on a click, its draft; mocked like the panel test
// does so the card renders without a QueryClient.
vi.mock("../../../../../../../lib/hooks/eval", () => ({
  useEvalCaseDraft: () => ({ data: undefined, isError: false, isFetching: false, error: null, refetch: vi.fn() }),
  findingCaseRejection: () => null,
}));
vi.mock("../../../../../../../lib/hooks/skill-eval", () => ({
  useFindingSkills: () => ({ data: { skills: [] }, isSuccess: true, isLoading: false, isError: false }),
}));

import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  it("shows the out-of-scope tag when scope is 'out_of_scope', not otherwise", () => {
    renderWithIntl(<FindingCard f={FINDING} onAction={() => {}} />);
    expect(screen.queryByText("Outside PR scope")).not.toBeInTheDocument();

    renderWithIntl(
      <FindingCard f={{ ...FINDING, scope: "out_of_scope" }} onAction={() => {}} />,
    );
    expect(screen.getByText("Outside PR scope")).toBeInTheDocument();
  });
});

describe("FindingCard eval case (SPEC-08, SPEC-10)", () => {
  const evalCase = { link: null, agentMissing: false, pullId: "pr1" };

  it("AC-1/AC-10: an expanded decided card with an evalCase shows the one Turn into eval case control after Accept and Dismiss", () => {
    const decided = { ...FINDING, accepted_at: "2026-09-17T00:00:00Z" };
    renderWithIntl(<FindingCard f={decided} defaultExpanded onAction={() => {}} evalCase={evalCase} />);
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /skill eval case/i })).not.toBeInTheDocument();
  });

  it("shows no eval button where the card has no review/agent context (evalCase omitted)", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: /eval case/i })).not.toBeInTheDocument();
  });
});
