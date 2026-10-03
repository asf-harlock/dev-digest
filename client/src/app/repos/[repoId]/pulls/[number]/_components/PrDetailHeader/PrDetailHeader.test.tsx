import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";

const ctx: { entries: unknown[] | undefined } = { entries: undefined };
vi.mock("@/lib/hooks/pr-context", () => ({
  usePrContext: () => ({ data: ctx.entries ? { entries: ctx.entries } : undefined }),
}));
vi.mock("../RunReviewDropdown", () => ({ RunReviewDropdown: () => <div /> }));

import { PrDetailHeader } from "./PrDetailHeader";

afterEach(() => {
  cleanup();
  ctx.entries = undefined;
});

const pr = {
  number: 482,
  title: "Add limiter",
  author: "a",
  branch: "feat",
  base: "main",
  status: "open",
  files_count: 3,
  additions: 1,
  deletions: 0,
} as never;

function renderHeader(onSetTab = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PrDetailHeader pr={pr} prId="pr1" tab="overview" findingsCount={0} onSetTab={onSetTab} onRunStart={() => {}} onRunsStarted={() => {}} />
    </NextIntlClientProvider>,
  );
  return onSetTab;
}

describe("PrDetailHeader — Context tab (SPEC-07 AC-1)", () => {
  it("AC-1: the Context tab sits after Files changed, carries the attached count when above zero and selects key 'context'", () => {
    ctx.entries = [{}, {}];
    const onSetTab = renderHeader();
    const tabs = screen.getAllByRole("button").filter((b) => /Overview|Agent runs|Files changed|PR context/.test(b.textContent ?? ""));
    const names = tabs.map((t) => t.textContent ?? "");
    const files = names.findIndex((n) => n.includes("Files changed"));
    const context = names.findIndex((n) => n.includes("PR context"));
    expect(context).toBe(files + 1);
    expect(tabs[context]!.textContent).toContain("2");
    fireEvent.click(tabs[context]!);
    expect(onSetTab).toHaveBeenCalledWith("context");
  });

  it("AC-1: no count badge when nothing is attached", () => {
    ctx.entries = [];
    renderHeader();
    const tab = screen.getAllByRole("button").filter((b) => /Overview|Agent runs|Files changed|PR context/.test(b.textContent ?? "")).find((t) => (t.textContent ?? "").includes("PR context"))!;
    expect(tab.textContent).toBe("PR context");
  });
});
