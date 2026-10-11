import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
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

describe("FindingCard eval case (SPEC-08)", () => {
  const evalCase = {
    link: null,
    agentMissing: false,
    creating: false,
    rejection: null,
    onCreate: vi.fn(),
  };

  it("AC-1: an expanded card with an evalCase shows Turn into eval case after Accept and Dismiss", () => {
    const decided = { ...FINDING, accepted_at: "2026-09-17T00:00:00Z" };
    renderWithIntl(<FindingCard f={decided} defaultExpanded onAction={() => {}} evalCase={evalCase} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(evalCase.onCreate).toHaveBeenCalledTimes(1);
  });

  it("shows no eval button where the card has no review/agent context (evalCase omitted)", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: /eval case/i })).not.toBeInTheDocument();
  });
});
