import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ReadingPathSection } from "./ReadingPathSection";
import { isActiveRecently } from "./helpers";

afterEach(cleanup);

const section = { kind: "reading_path" as const, items: [{ path: "a.ts", why: "x", hotness: 0.5 }, { path: "b.ts", why: "y", hotness: 0.49 }, { path: "c.ts", why: "z", hotness: null }] };
const ui = (activityRanked: boolean) => (
  <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
    <ReadingPathSection section={section} activityRanked={activityRanked} />
  </NextIntlClientProvider>
);

describe("ReadingPathSection", () => {
  it("AC-27: 'Active recently' at hotness >= 0.5, only for activity-ranked tours", () => {
    render(ui(true));
    expect(screen.getAllByText(/Active recently/)).toHaveLength(1);
    cleanup();
    render(ui(false));
    expect(screen.queryByText(/Active recently/)).toBeNull();
  });

  it("each path opens the file on GitHub in a new tab, pinned to the tour's ref", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <ReadingPathSection section={section} repoFullName="acme/api" sha="abc123" />
      </NextIntlClientProvider>,
    );
    const link = screen.getByRole("link", { name: "Open a.ts on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/api/blob/abc123/a.ts");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("a.ts");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("without a repo name or ref the paths stay plain text", () => {
    render(ui(false));
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("a.ts")).toBeInTheDocument();
  });

  it("threshold", () => {
    expect([isActiveRecently(0.5), isActiveRecently(0.49), isActiveRecently(null)]).toEqual([true, false, false]);
  });
});
