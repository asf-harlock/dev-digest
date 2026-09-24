import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/intent.json";
import type { PrIntentRecord } from "@devdigest/shared";

const mutate = vi.fn();
vi.mock("../../../../../../../lib/hooks/intent", () => ({
  useClassifyIntent: () => ({ mutate, isPending: false }),
}));

import { IntentCard } from "./IntentCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const baseIntent: PrIntentRecord = {
  pr_id: "pr1",
  intent: "Add pagination to the pull requests list.",
  in_scope: ["client/src/app/repos/[repoId]/pulls/_components/PullsList"],
  out_of_scope: ["Unrelated refactor of the settings page"],
  confidence: "medium",
  sources: [{ kind: "description", status: "missing" }],
  classified_at: "2026-09-20T00:00:00.000Z",
  classified_for_sha: "abc123",
};

describe("IntentCard (smoke)", () => {
  it("shows an empty state with a classify CTA when no intent exists yet, and runs classification on click", () => {
    renderWithIntl(<IntentCard prId="pr1" intent={null} headSha="abc123" />);

    expect(screen.getByText("Intent not classified yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /classify intent/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("renders the summary, confidence badge, scope lists, and a non-dismissable source warning", () => {
    renderWithIntl(<IntentCard prId="pr1" intent={baseIntent} headSha="abc123" />);

    // The intent renders as a quote, in the card's own "Intent" header.
    expect(screen.getByText(`“${baseIntent.intent}”`)).toBeInTheDocument();
    expect(screen.getByText("Intent")).toBeInTheDocument();
    expect(screen.getByText("Medium confidence")).toBeInTheDocument();
    expect(screen.getByText(baseIntent.in_scope[0]!)).toBeInTheDocument();
    expect(screen.getByText(baseIntent.out_of_scope[0]!)).toBeInTheDocument();
    expect(
      screen.getByText(/the PR description was not provided/i),
    ).toBeInTheDocument();
  });

  it("shows a muted placeholder under an empty scope list", () => {
    renderWithIntl(<IntentCard prId="pr1" intent={{ ...baseIntent, out_of_scope: [] }} headSha="abc123" />);
    expect(screen.getByText("None declared")).toBeInTheDocument();
  });

  it("re-runs classification from the compact header button", () => {
    mutate.mockClear();
    renderWithIntl(<IntentCard prId="pr1" intent={baseIntent} headSha="abc123" />);
    fireEvent.click(screen.getByRole("button", { name: "Run classification" }));
    expect(mutate).toHaveBeenCalled();
  });

  it("hides Risk areas without risks and renders a chip per risk when supplied", () => {
    renderWithIntl(<IntentCard prId="pr1" intent={baseIntent} headSha="abc123" />);
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    cleanup();

    renderWithIntl(
      <IntentCard
        prId="pr1"
        intent={baseIntent}
        headSha="abc123"
        risks={[
          { kind: "auth", title: "Auth surface touched", explanation: "e", severity: "high", file_refs: [] },
          { kind: "dep", title: "New dependency: ioredis", explanation: "e", severity: "medium", file_refs: [] },
        ]}
      />,
    );
    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Auth surface touched")).toBeInTheDocument();
    expect(screen.getByText("New dependency: ioredis")).toBeInTheDocument();
  });

  it("shows a staleness banner when the PR's head_sha has moved since classification", () => {
    renderWithIntl(
      <IntentCard prId="pr1" intent={baseIntent} headSha="def456" />,
    );
    expect(screen.getByText("PR updated since this was classified")).toBeInTheDocument();
  });
});
