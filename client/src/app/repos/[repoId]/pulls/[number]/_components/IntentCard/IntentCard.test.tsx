import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/intent.json";
import type { PrIntentRecord } from "@devdigest/shared";

const mutate = vi.fn();
const hookState = { isClassifying: false };
vi.mock("../../../../../../../lib/hooks/intent", () => ({
  useIntentClassification: () => ({ start: mutate, isClassifying: hookState.isClassifying }),
}));
const prContext: { fingerprint: string | null | undefined } = { fingerprint: undefined };
vi.mock("../../../../../../../lib/hooks/pr-context", async (orig) => ({
  ...(await orig<typeof import("../../../../../../../lib/hooks/pr-context")>()),
  usePrContext: () => ({ data: prContext.fingerprint === undefined ? undefined : { fingerprint: prContext.fingerprint } }),
}));

import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  hookState.isClassifying = false;
  prContext.fingerprint = undefined;
});

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

  it("while classifying, shows a status line and disables both the empty-state CTA and the re-run button", () => {
    hookState.isClassifying = true;
    renderWithIntl(<IntentCard prId="pr1" intent={null} headSha="abc123" />);
    expect(screen.getByText(/Classifying intent/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /classify intent/i })).toBeDisabled();
    cleanup();

    renderWithIntl(<IntentCard prId="pr1" intent={baseIntent} headSha="abc123" />);
    expect(screen.getByRole("status")).toHaveTextContent(/Classifying intent/);
    expect(screen.getByRole("button", { name: "Classifying…" })).toBeDisabled();
  });

  it("re-runs classification from the compact header button", () => {
    mutate.mockClear();
    renderWithIntl(<IntentCard prId="pr1" intent={baseIntent} headSha="abc123" />);
    fireEvent.click(screen.getByRole("button", { name: "Run classification" }));
    expect(mutate).toHaveBeenCalled();
  });

  it("shows a staleness banner when the PR's head_sha has moved since classification", () => {
    renderWithIntl(
      <IntentCard prId="pr1" intent={baseIntent} headSha="def456" />,
    );
    expect(screen.getByText("PR updated since this was classified")).toBeInTheDocument();
  });
});

describe("IntentCard — PR-context stale note (SPEC-07 AC-39, EC-21)", () => {
  const note = "Classified with different PR context";

  it("AC-39: shown when the stored fingerprint differs from the current one", () => {
    prContext.fingerprint = "new";
    renderWithIntl(<IntentCard prId="pr1" intent={{ ...baseIntent, context_fingerprint: "old" }} headSha="abc123" />);
    expect(screen.getByText(note)).toBeInTheDocument();
  });

  it("AC-39: not shown when equal; a null/absent stored fingerprint is never stale; unloaded current is unknown", () => {
    prContext.fingerprint = "same";
    renderWithIntl(<IntentCard prId="pr1" intent={{ ...baseIntent, context_fingerprint: "same" }} headSha="abc123" />);
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    cleanup();
    prContext.fingerprint = "new";
    renderWithIntl(<IntentCard prId="pr1" intent={{ ...baseIntent, context_fingerprint: null }} headSha="abc123" />);
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    cleanup();
    renderWithIntl(<IntentCard prId="pr1" intent={baseIntent} headSha="abc123" />);
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    cleanup();
    prContext.fingerprint = undefined;
    renderWithIntl(<IntentCard prId="pr1" intent={{ ...baseIntent, context_fingerprint: "old" }} headSha="abc123" />);
    expect(screen.queryByText(note)).not.toBeInTheDocument();
  });
});
