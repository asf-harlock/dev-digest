import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../PrBrief", () => ({ PrBrief: () => <div data-testid="pr-brief" /> }));

import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);

function renderTab(prBody: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages }}>
      <OverviewTab prId="pr1" prBody={prBody} intent={null} headSha="abc" repoId="r1" repoFullName="o/r" onOpenFile={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab", () => {
  it("SPEC-06 AC-27: renders the Description card below the PR Brief, as sanitised markdown", () => {
    renderTab("Adds **rate limiting**\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))");

    const brief = screen.getByTestId("pr-brief");
    const card = screen.getByRole("region", { name: prReviewMessages.overview.description });
    expect(brief.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.querySelector("strong")).toHaveTextContent("rate limiting");
    expect(card.querySelector("script")).toBeNull();
    expect(card.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("SPEC-06 AC-27: no Description card when the PR body is empty", () => {
    renderTab(null);
    expect(screen.getByTestId("pr-brief")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: prReviewMessages.overview.description })).not.toBeInTheDocument();
  });
});
