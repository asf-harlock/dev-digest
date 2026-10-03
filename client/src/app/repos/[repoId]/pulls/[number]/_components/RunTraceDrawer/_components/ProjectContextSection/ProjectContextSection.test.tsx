import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextEntry, RunTrace, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { ProjectContextSection } from "./ProjectContextSection";
import { TraceBody } from "../TraceBody";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

const entry = (over: Partial<ProjectContextEntry> = {}): ProjectContextEntry => ({
  path: "docs/arch.md",
  kind: "docs",
  origin: "skill:naming",
  sha: "abc",
  tokens: 321,
  status: "attached",
  text: "# Heading\n<script>alert(1)</script>",
  ...over,
});

describe("ProjectContextSection", () => {
  it("AC-30/AC-31/UI-6: row shows path, tokens, origin, status; expand shows text in <pre>, never as HTML", () => {
    const { container } = wrap(
      <ProjectContextSection entries={[entry(), entry({ path: "x.md", status: "over_budget", text: "" })]} />,
    );
    expect(screen.getByText("docs/arch.md")).toBeInTheDocument();
    expect(screen.getAllByText("≈ 321 tokens")).toHaveLength(2);
    expect(screen.getAllByText("skill:naming")).toHaveLength(2);
    expect(screen.getByText("attached")).toBeInTheDocument();
    expect(screen.getByText("over budget")).toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /docs\/arch\.md/ }));
    const pre = container.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.textContent).toBe("# Heading\n<script>alert(1)</script>");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
  });
});

const baseTrace = (extra: Partial<RunTrace> = {}): RunTrace =>
  ({
    config: { agent: "a", model: "m", provider: "p", source: "local" },
    stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: null, findings: 0, grounding: "0/0" },
    prompt_assembly: { system: "sys", user: "usr" },
    tool_calls: [],
    memory_pulled: [],
    specs_read: [],
    log: [],
    ...extra,
  }) as unknown as RunTrace;

describe("TraceBody project context", () => {
  it("AC-32/EC-17: section titled 'Project context' when present, hidden when absent", () => {
    wrap(<TraceBody trace={baseTrace({ project_context: [entry()] })} findings={[] as FindingRecord[]} />);
    expect(screen.getByText(/Project context/)).toBeInTheDocument();
    cleanup();
    wrap(<TraceBody trace={baseTrace()} findings={[] as FindingRecord[]} />);
    expect(screen.queryByText(/Project context/)).not.toBeInTheDocument();
  });
});
