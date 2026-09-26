import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/blast.json";
import type { BlastRadius } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

// --- hooks: BlastRadiusCard reads both through the "@/lib/hooks" barrel it
// imports from (client/CLAUDE.md: no fetch in components). ---
const resyncMutate = vi.fn();
const hookState: {
  isLoading: boolean;
  isError: boolean;
  data: BlastRadius | undefined;
  resyncPending: boolean;
} = { isLoading: false, isError: false, data: undefined, resyncPending: false };

vi.mock("@/lib/hooks", () => ({
  useBlastRadius: () => ({
    data: hookState.data,
    isLoading: hookState.isLoading,
    isError: hookState.isError,
    refetch: vi.fn(),
  }),
  useResyncRepoIntel: () => ({ mutate: resyncMutate, isPending: hookState.resyncPending }),
}));

// --- MermaidDiagram lazy-loads the real `mermaid` package client-side; stub
// it so the Tree/Graph toggle test doesn't pull that in. ---
vi.mock("@/components/mermaid-diagram", () => ({
  MermaidDiagram: ({ chart }: { chart: string }) => <div data-testid="mermaid-diagram">{chart}</div>,
}));

import { BlastRadiusCard } from "./BlastRadiusCard";

afterEach(() => {
  cleanup();
  hookState.isLoading = false;
  hookState.isError = false;
  hookState.data = undefined;
  hookState.resyncPending = false;
  resyncMutate.mockClear();
});

function renderCard(props: Partial<React.ComponentProps<typeof BlastRadiusCard>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastRadiusCard
        prId="pr1"
        repoId="repo1"
        repoFullName="acme/payments-api"
        headSha="abcdef1234"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function baseBlast(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [
      { name: "createUser", file: "users.ts", kind: "function" },
      { name: "sendEmail", file: "email.ts", kind: "function" },
    ],
    downstream: [
      {
        symbol: "createUser",
        callers: [
          { name: "handler", file: "routes/users.ts", line: 10 },
          { name: "middleware", file: "routes/mw.ts", line: 5 },
        ],
        endpoints_affected: ["POST /users"],
        crons_affected: [],
      },
      {
        symbol: "sendEmail",
        callers: [{ name: "worker", file: "jobs/worker.ts", line: 20 }],
        endpoints_affected: [],
        crons_affected: ["nightly-email-digest"],
      },
    ],
    summary: "2 changed symbols · 3 callers · 1 endpoint · 1 cron",
    ...overrides,
  };
}

describe("BlastRadiusCard", () => {
  it("shows a loading skeleton while the query is pending", () => {
    hookState.isLoading = true;
    const { container } = renderCard();

    expect(screen.getByText("Blast radius")).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a compact error state on query failure, without a second (self-)toast", () => {
    hookState.isError = true;
    renderCard();

    // client/INSIGHTS.md: query failures are already toasted globally by
    // QueryCache.onError — the card itself must not call any toast API, so
    // there is nothing else to assert here beyond the inline error state.
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the blast radius.");
  });

  it("shows an empty state when there are no changed symbols and the map isn't degraded", () => {
    hookState.data = baseBlast({ changed_symbols: [], downstream: [] });
    renderCard();

    expect(screen.getByText("No symbol-level changes to map for this PR.")).toBeInTheDocument();
  });

  it("shows a no-downstream note when there are changed symbols but no callers", () => {
    hookState.data = baseBlast({
      changed_symbols: [
        { name: "a", file: "a.ts", kind: "function" },
        { name: "b", file: "b.ts", kind: "function" },
      ],
      downstream: [],
    });
    renderCard();

    expect(screen.getByText("2 changed symbols, no downstream callers found.")).toBeInTheDocument();
    // The summary row still renders (0 callers is an answer), but there is
    // nothing to switch between, so no Tree/Graph toggle.
    expect(screen.getByTitle("0 callers")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Graph" })).not.toBeInTheDocument();
  });

  it("shows a degraded warning with a Rebuild index CTA for a resyncable reason, and calls resync on click", () => {
    hookState.data = baseBlast({ changed_symbols: [], downstream: [], degraded: true, reason: "index_failed" });
    renderCard();

    expect(
      screen.getByText("The repo index failed to build — this map may be incomplete."),
    ).toBeInTheDocument();
    expect(screen.getByText("Rebuilding the index may fill in missing callers, endpoints, and crons.")).toBeInTheDocument();

    const cta = screen.getByRole("button", { name: "Rebuild index" });
    fireEvent.click(cta);
    expect(resyncMutate).toHaveBeenCalled();
  });

  it("shows a degraded warning without a Rebuild index CTA for a non-resyncable reason", () => {
    hookState.data = baseBlast({ changed_symbols: [], downstream: [], degraded: true, reason: "flag_off" });
    renderCard();

    expect(screen.getByText("Blast radius is turned off for this workspace.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rebuild index" })).not.toBeInTheDocument();
  });

  it("renders stat counts with accessible names, and expands/collapses a symbol's caller list", () => {
    hookState.data = baseBlast();
    renderCard({ repoFullName: null, headSha: null });

    const symbolsStat = screen.getByTitle("2 symbols");
    expect(symbolsStat).toHaveAttribute("aria-label", "2 symbols");
    expect(screen.getByTitle("3 callers")).toHaveAttribute("aria-label", "3 callers");
    expect(screen.getByTitle("1 endpoint")).toHaveAttribute("aria-label", "1 endpoint");
    expect(screen.getByTitle("1 cron")).toHaveAttribute("aria-label", "1 cron");

    // First group (createUser) starts expanded; its caller is visible as plain
    // text (no repoFullName/headSha supplied).
    expect(screen.getByText("routes/users.ts:10")).toBeInTheDocument();
    // Second group (sendEmail) starts collapsed.
    expect(screen.queryByText("jobs/worker.ts:20")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("sendEmail()"));
    expect(screen.getByText("jobs/worker.ts:20")).toBeInTheDocument();

    fireEvent.click(screen.getByText("createUser()"));
    expect(screen.queryByText("routes/users.ts:10")).not.toBeInTheDocument();
  });

  it("adds call parens only to callable symbol kinds and pluralises the caller count", () => {
    hookState.data = baseBlast({
      changed_symbols: [
        { name: "createUser", file: "users.ts", kind: "function" },
        { name: "Mailer", file: "email.ts", kind: "class" },
      ],
      downstream: [
        baseBlast().downstream[0]!,
        { symbol: "Mailer", callers: [{ name: "worker", file: "jobs/worker.ts", line: 20 }], endpoints_affected: [], crons_affected: [] },
      ],
    });
    renderCard();

    expect(screen.getByText("createUser()")).toBeInTheDocument();
    expect(screen.getByText("Mailer")).toBeInTheDocument();
    expect(screen.getByText("2 callers")).toBeInTheDocument();
    expect(screen.getByText("1 caller")).toBeInTheDocument();
  });

  it("links each caller to its exact GitHub blob line when the repo and head sha are known", () => {
    hookState.data = baseBlast();
    renderCard({ repoFullName: "acme/payments-api", headSha: "abcdef1234" });

    const link = screen.getByRole("link", { name: "routes/users.ts:10" });
    expect(link).toHaveAttribute("href", githubBlobUrl("acme/payments-api", "abcdef1234", "routes/users.ts", 10));
  });

  it("falls back to plain (non-linked) text when repoFullName is missing", () => {
    hookState.data = baseBlast();
    renderCard({ repoFullName: null, headSha: "abcdef1234" });

    expect(screen.getByText("routes/users.ts:10")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "routes/users.ts:10" })).not.toBeInTheDocument();
  });

  it("renders endpoint and cron chips for a symbol's downstream impact", () => {
    hookState.data = baseBlast();
    renderCard();

    // createUser's row is expanded by default → its endpoint chip is visible.
    expect(screen.getByText("POST /users")).toBeInTheDocument();

    // sendEmail's row starts collapsed → expand to see its cron chip.
    fireEvent.click(screen.getByText("sendEmail()"));
    expect(screen.getByText("nightly-email-digest")).toBeInTheDocument();
  });

  it("toggles between Tree and Graph views", () => {
    hookState.data = baseBlast();
    renderCard();

    expect(screen.getByText("createUser()")).toBeInTheDocument();
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    expect(screen.queryByText("createUser()")).not.toBeInTheDocument();
    expect(screen.getByTestId("mermaid-diagram")).toHaveTextContent("flowchart LR");

    fireEvent.click(screen.getByRole("button", { name: "Tree" }));
    expect(screen.getByText("createUser()")).toBeInTheDocument();
    expect(screen.queryByTestId("mermaid-diagram")).not.toBeInTheDocument();
  });
});
