import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import type { OnboardingTourResponse } from "@devdigest/shared";
import { TourHeader } from "./TourHeader";
import { freshnessState } from "./helpers";

afterEach(cleanup);

const base: OnboardingTourResponse = {
  stored: false,
  generating: false,
  stale: false,
  tour: { sections: [], meta: { source: "skeleton", degraded_reason: "partial index", ranking_mode: "import_graph" } },
  file_count: 120,
  can_use_activity: false,
};

function setup(over: Partial<OnboardingTourResponse>, sha: string | undefined, generating = false) {
  render(
    <NextIntlClientProvider locale="en" now={new Date()} messages={{ onboarding: messages }}>
      <TourHeader repoName="acme/app" data={{ ...base, ...over }} lastIndexedSha={sha} generating={generating} onGenerate={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("TourHeader", () => {
  it("AC-17/18: skeleton badge with reason, ~N files, ranking label, Generate button", () => {
    setup({}, "sha1");
    expect(screen.getByText("Skeleton — partial index")).toBeInTheDocument();
    expect(screen.getByText("~120 files")).toBeInTheDocument();
    expect(screen.getByText("Ranked by import graph")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled();
  });

  it("AC-19: shows Stale when the server says stale and an index exists", () => {
    setup({ stale: true }, "sha2");
    expect(screen.getByText(/^Stale/)).toBeInTheDocument();
  });

  it("EC-11: 'No index yet' replaces Stale when lastIndexedSha is empty", () => {
    setup({ stale: true }, "");
    expect(screen.getByText("No index yet")).toBeInTheDocument();
    expect(screen.queryByText(/^Stale/)).toBeNull();
  });

  it("disables the button while generating", () => {
    setup({ stored: true }, "sha1", true);
    expect(screen.getByRole("button", { name: "Generating…" })).toBeDisabled();
  });

  it("freshnessState: unknown index never claims 'No index yet'", () => {
    expect(freshnessState(false, undefined)).toBe("none");
    expect(freshnessState(true, "")).toBe("noIndex");
  });
});
