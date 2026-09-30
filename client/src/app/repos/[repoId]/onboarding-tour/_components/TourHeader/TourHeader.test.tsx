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

  it("AC-17/29: llm tour shows 'Written by <model>' and the model hint; Regenerate label when stored", () => {
    setup(
      {
        stored: true,
        model_hint: { provider: "openai", model: "gpt-x" },
        tour: { sections: [], meta: { source: "llm", model: "gpt-x", generated_at: new Date().toISOString() } },
      },
      "sha1",
    );
    expect(screen.getByText("Written by gpt-x")).toBeInTheDocument();
    expect(screen.getByText("Uses openai / gpt-x")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Regenerate" })).toHaveAccessibleDescription("Uses openai / gpt-x");
  });

  it("EC-7: 'Model not configured' keeps the reason and adds a Settings link", () => {
    setup({ tour: { sections: [], meta: { source: "skeleton", degraded_reason: "Model not configured" } } }, "sha1");
    expect(screen.getByText("Skeleton — Model not configured")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Feature Models/ })).toHaveAttribute("href", "/settings/models");
  });

  it("EC-3: failed regeneration on a stored llm tour shows the notice; not on a skeleton", () => {
    const meta = { source: "llm" as const, last_error: "Tour generation failed", generated_at: new Date().toISOString() };
    setup({ stored: true, tour: { sections: [], meta } }, "sha1");
    expect(screen.getByText(/Last regeneration failed · showing the tour from/)).toBeInTheDocument();
    cleanup();
    setup({ stored: true, tour: { sections: [], meta: { ...meta, last_error_at: new Date().toISOString() } } }, "sha1");
    expect(screen.getByText(/^Last regeneration failed · (now|in|.*ago)/)).toBeInTheDocument();
    cleanup();
    setup({ stored: true, tour: { sections: [], meta: { ...meta, source: "skeleton" } } }, "sha1");
    expect(screen.queryByText(/Last regeneration failed/)).toBeNull();
  });

  it("freshnessState: unknown index never claims 'No index yet'", () => {
    expect(freshnessState(false, undefined)).toBe("none");
    expect(freshnessState(true, "")).toBe("noIndex");
  });
});
