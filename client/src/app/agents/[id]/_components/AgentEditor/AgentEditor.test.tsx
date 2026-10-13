import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// The CI tab has its own tests; here only the editor's routing to it matters.
vi.mock("./_components/CiTab", () => ({ CiTab: () => <div data-testid="ci-tab">CI tab content</div> }));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });
});

describe("A2 Agent Editor — Evals tab (SPEC-08)", () => {
  it("AC-10: the tab bar lists Evals after Context", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const context = screen.getByRole("button", { name: "Context" });
    const evals = screen.getByRole("button", { name: "Evals" });
    expect(context.compareDocumentPosition(evals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("A2 Agent Editor — CI tab (SPEC-12)", () => {
  it("AC-36: the tab bar lists CI after Evals", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    const evals = screen.getByRole("button", { name: "Evals" });
    const ci = screen.getByRole("button", { name: "CI" });
    expect(evals.compareDocumentPosition(ci) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-36: tab=ci renders the CI tab and clicking the CI tab asks the page to switch to it", () => {
    const onTab = vi.fn();
    renderWithIntl(<AgentEditor agent={AGENT} tab="ci" onTab={onTab} />);
    expect(screen.getByTestId("ci-tab")).toBeInTheDocument();
    expect(screen.queryByText("Save agent")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CI" }));
    expect(onTab).toHaveBeenCalledWith("ci");
  });
});
