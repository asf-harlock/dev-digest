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

  it("threshold", () => {
    expect([isActiveRecently(0.5), isActiveRecently(0.49), isActiveRecently(null)]).toEqual([true, false, false]);
  });
});
