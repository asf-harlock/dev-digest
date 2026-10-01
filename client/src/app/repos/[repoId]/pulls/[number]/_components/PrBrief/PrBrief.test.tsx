/* PrBrief.test.tsx — states of the Overview's PR Brief section (specs/06-pr-brief.md).
   The network is the only mock (routed by URL); BlastRadiusCard is stubbed
   because it is a separate feature with its own test file. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BriefResponse } from "@devdigest/shared";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import intentMessages from "../../../../../../../../messages/en/intent.json";

vi.mock("../BlastRadiusCard", () => ({ BlastRadiusCard: () => <div data-testid="blast-stub" /> }));

import { PrBrief } from "./PrBrief";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(over: Partial<BriefResponse> = {}): BriefResponse {
  return {
    brief: { summary: "Adds rate limiting to the users API.", risks: [], review_focus: [] },
    meta: { generated_at: "2026-09-01T00:00:00Z", generated_for_sha: "abcdef1234567", last_error_at: null },
    generating: false,
    stale: false,
    missing_inputs: [],
    ...over,
  };
}
const NO_BRIEF = response({ brief: null, meta: null });

interface Net {
  get: BriefResponse;
  post?: { status: number; body: unknown };
  calls: string[];
}

function mockNet(get: BriefResponse, post?: Net["post"]): Net {
  const net: Net = { get, post, calls: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      net.calls.push(`${method} ${String(url)}`);
      const r = method === "POST" ? (net.post ?? { status: 200, body: { status: "running" } }) : { status: 200, body: net.get };
      return { ok: r.status < 400, status: r.status, statusText: "x", json: async () => r.body } as Response;
    }),
  );
  return net;
}

function renderBrief(onOpenFile = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ brief: briefMessages, intent: intentMessages }}>
        <PrBrief prId="pr1" intent={null} headSha="abc" repoId="r1" repoFullName="o/r" onOpenFile={onOpenFile} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return onOpenFile;
}

describe("PrBrief", () => {
  it("SPEC-06 AC-1: with no brief it says so and offers Generate brief, which POSTs once", async () => {
    const net = mockNet(NO_BRIEF);
    renderBrief();

    expect(await screen.findByText("No brief exists yet")).toBeInTheDocument();
    expect(net.calls.filter((c) => c.startsWith("POST"))).toHaveLength(0); // NFR-11: never on load
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    await waitFor(() => expect(net.calls.filter((c) => c.startsWith("POST"))).toHaveLength(1));
    expect(net.calls.find((c) => c.startsWith("POST"))).toMatch(/\/pulls\/pr1\/brief$/);
  });

  it("SPEC-06 AC-3: shows a skeleton while generating, with no empty-state text", async () => {
    mockNet({ ...NO_BRIEF, generating: true });
    renderBrief();

    expect(await screen.findByTestId("brief-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("No brief exists yet")).not.toBeInTheDocument();
    expect(screen.queryByText(/Generate a short summary/)).not.toBeInTheDocument();
  });

  it("SPEC-06 AC-3: Regenerate over an existing brief swaps the summary for a skeleton", async () => {
    mockNet(response({ generating: true }));
    renderBrief();

    expect(await screen.findByTestId("brief-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("Adds rate limiting to the users API.")).not.toBeInTheDocument();
    expect(screen.queryByText("No brief exists yet")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate brief" })).toBeDisabled();
  });

  it("SPEC-06 UI-7: the summary is plain text; markup shows literally", async () => {
    const summary = '<b>bold</b> <img src=x onerror="alert(1)"> **md**';
    mockNet(response({ brief: { summary, risks: [], review_focus: [] } }));
    renderBrief();

    const p = await screen.findByText(summary);
    expect(p.querySelector("b, img")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("SPEC-06 AC-24: a stale brief shows the older-commit note with the short sha", async () => {
    mockNet(response({ stale: true }));
    renderBrief();
    expect(await screen.findByText("Generated for an older commit (abcdef1)")).toBeInTheDocument();
  });

  it("SPEC-06 EC-5: a stored last_error is shown with a Retry that POSTs again", async () => {
    const net = mockNet(
      response({ meta: { generated_at: "A", last_error: "model timed out", last_error_at: "B" } }),
    );
    renderBrief();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Brief generation failed: model timed out");
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(net.calls.filter((c) => c.startsWith("POST"))).toHaveLength(1));
  });

  it("SPEC-06 EC-2: a config_error on Generate links to /settings/models and offers no Retry", async () => {
    mockNet(NO_BRIEF, { status: 400, body: { error: { code: "config_error", message: "no key" } } });
    renderBrief();

    fireEvent.click(await screen.findByRole("button", { name: "Generate brief" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No API key is configured for the brief model.");
    expect(within(alert).getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings/models");
    expect(within(alert).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("SPEC-06 AC-26: lists the inputs that were missing", async () => {
    mockNet(
      response({ missing_inputs: [{ kind: "specs_missing" }, { kind: "description_empty" }] }),
    );
    renderBrief();

    expect(await screen.findByText("Inputs that were missing or limited")).toBeInTheDocument();
    expect(screen.getByText(/No spec documents were available/)).toBeInTheDocument();
    expect(screen.getByText("The PR description is empty.")).toBeInTheDocument();
  });

  it("SPEC-06 AC-26: names attached spec documents the budget skipped instead of asking to attach", async () => {
    mockNet(response({ missing_inputs: [{ kind: "specs_missing", reason: "specs/04-project-context.md" }] }));
    renderBrief();

    expect(await screen.findByText(/were skipped .* specs\/04-project-context\.md/)).toBeInTheDocument();
    expect(screen.queryByText(/No spec documents were available/)).not.toBeInTheDocument();
  });

  it("SPEC-06 AC-12: Review focus rows show file:line, a count, and open the file on click", async () => {
    mockNet(
      response({
        brief: {
          summary: "s",
          risks: [],
          review_focus: [
            { file: "src/a.ts", line: 12, reason: "Auth check moved" },
            { file: "src/b.ts", line: 3, reason: "New cache" },
          ],
        },
      }),
    );
    const onOpenFile = renderBrief();

    const row = await screen.findByRole("button", { name: /src\/a\.ts:12/ });
    expect(row).toHaveTextContent("Auth check moved");
    expect(screen.getByText("Review focus — read these first").parentElement).toHaveTextContent("2");
    fireEvent.click(row);
    expect(onOpenFile).toHaveBeenCalledWith("src/a.ts", 12);
  });

  it("SPEC-06 EC-15: an empty review focus shows the empty text and a zero count", async () => {
    mockNet(response());
    renderBrief();

    expect(await screen.findByText("No specific places to focus on.")).toBeInTheDocument();
    expect(screen.getByText("Review focus — read these first").parentElement).toHaveTextContent("0");
  });

  it("SPEC-06 D5: the context hint points at Project Context, Agents and Skills", async () => {
    mockNet(NO_BRIEF);
    renderBrief();

    expect(await screen.findByText("Specs come from Project Context")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Project Context" })).toHaveAttribute("href", "/repos/r1/context");
    expect(screen.getByRole("link", { name: "Agents" })).toHaveAttribute("href", "/agents");
    expect(screen.getByRole("link", { name: "Skills" })).toHaveAttribute("href", "/skills");
  });
});
