/* DiffTab.test.tsx — component coverage for the Smart Diff wiring in the
   "Files changed" tab (pr-self-review round 2 fix). Mirrors the fetch-mock +
   QueryClientProvider pattern from `lib/hooks/smart-diff.test.tsx`, and the
   NextIntlClientProvider + messages/en setup from
   `SmartDiffGroups/SmartDiffGroups.test.tsx`. Other hooks the tab calls
   (`usePrComments`, `usePrReviews`) are backed by the same fetch mock, routed
   by URL, rather than mocked at the hook level — DiffTab imports them
   directly and there's no seam to intercept short of the network. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrFile, SmartDiffResponse } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FILES: PrFile[] = [
  { path: "src/api/users.ts", additions: 3, deletions: 1, patch: null },
  { path: "docs/rate-limiting.md", additions: 2, deletions: 0, patch: null },
];

type SmartDiffMock = "pending" | { status: number; body?: SmartDiffResponse };

/** Routes the mocked `fetch` by URL: comments/reviews always resolve empty
 *  (not the subject of this test), smart-diff resolves per `smartDiff`
 *  (never, to pin the loading state; or with a given status/body). */
function mockFetch(smartDiff: SmartDiffMock) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/smart-diff")) {
      if (smartDiff === "pending") return new Promise<Response>(() => {}); // never resolves
      const { status, body } = smartDiff;
      if (status >= 400) {
        return Promise.resolve({
          ok: false,
          status,
          json: async () => ({ error: { message: "smart-diff failed" } }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
    }
    // /pulls/:id/comments, /pulls/:id/reviews
    return Promise.resolve({ ok: true, status: 200, json: async () => [] } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
        <DiffTab prId="pr1" filesCount={FILES.length} files={FILES} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("DiffTab", () => {
  it("shows the loading placeholder while smart-diff is pending, with no file cards yet", async () => {
    mockFetch("pending");
    renderTab();

    expect(await screen.findByText("Loading the reviewer-ordered diff…")).toBeInTheDocument();
    expect(screen.queryByText("src/api/users.ts")).not.toBeInTheDocument();
    expect(screen.queryByText("docs/rate-limiting.md")).not.toBeInTheDocument();
  });

  it("renders role-grouped headers and the Smart/Original toggle once groups resolve", async () => {
    const body: SmartDiffResponse = {
      groups: [
        { role: "core", files: [{ path: "src/api/users.ts", additions: 3, deletions: 1, finding_lines: [] }] },
        { role: "docs", files: [{ path: "docs/rate-limiting.md", additions: 2, deletions: 0, finding_lines: [] }] },
      ],
      split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
    };
    mockFetch({ status: 200, body });
    renderTab();

    const headers = await screen.findAllByRole("button", { name: /Core logic|Docs/ });
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringContaining("Core logic"),
      expect.stringContaining("Docs"),
    ]);
    expect(screen.getByRole("button", { name: "Smart order" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Original order" })).toBeInTheDocument();
  });

  it("falls back to the flat file list with no group headers when smart-diff 500s", async () => {
    mockFetch({ status: 500 });
    renderTab();

    expect(await screen.findByText("src/api/users.ts")).toBeInTheDocument();
    expect(screen.getByText("docs/rate-limiting.md")).toBeInTheDocument();
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    // The failed query means there's nothing to toggle between.
    expect(screen.queryByRole("button", { name: "Smart order" })).not.toBeInTheDocument();
  });

  it("falls back to the flat file list with no group headers when smart-diff returns empty groups", async () => {
    const body: SmartDiffResponse = {
      groups: [],
      split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
    };
    mockFetch({ status: 200, body });
    renderTab();

    expect(await screen.findByText("src/api/users.ts")).toBeInTheDocument();
    expect(screen.getByText("docs/rate-limiting.md")).toBeInTheDocument();
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.queryByText("Docs")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Smart order" })).not.toBeInTheDocument();
  });
});
