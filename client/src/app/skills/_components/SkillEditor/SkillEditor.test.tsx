import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillEditor } from "./SkillEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SKILL: Skill = {
  id: "sk1",
  name: "test-coverage-nudge",
  description: "every new branch needs an assertion that fails without it",
  type: "custom",
  source: "manual",
  body: "# Rule\nCover it.",
  enabled: true,
  version: 2,
  token_estimate: 42,
  injection_flagged: false,
  injection_patterns: [],
};

/** The editor owns the skill's eval overview query (the header "Run on evals" button), so it
 *  needs a QueryClient; the request never settles — these tests are about the header. */
function renderWithIntl(ui: React.ReactElement) {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** Rendered with the (hook-free) Preview tab so the header/banner is tested
 *  in isolation from ConfigTab's own mutation hooks (covered separately). */
describe("SkillEditor header", () => {
  it("renders no injection banner or badge for a clean skill", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="preview" onTab={vi.fn()} />);
    expect(screen.queryByText("INJECTION DETECTED — DO NOT ENABLE")).not.toBeInTheDocument();
    expect(screen.queryByText("Injection detected")).not.toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });

  it("keeps Run on evals disabled until the overview says a run can start (EC-11, EC-13)", () => {
    renderWithIntl(<SkillEditor skill={SKILL} tab="preview" onTab={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Run on evals" })).toBeDisabled();
  });

  it("renders the injection banner and badge for a flagged skill", () => {
    const flagged: Skill = { ...SKILL, enabled: false, injection_flagged: true, injection_patterns: ["instruction-override"] };
    renderWithIntl(<SkillEditor skill={flagged} tab="preview" onTab={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("INJECTION DETECTED — DO NOT ENABLE");
    expect(screen.getByText("This skill contains prompt injection patterns. It has been automatically blocked.")).toBeInTheDocument();
    expect(screen.getByText("Injection detected")).toBeInTheDocument();
  });
});
