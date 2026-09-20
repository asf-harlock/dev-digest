import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, AgentSkillDetail, SkillSummary } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { LinkToAgentPanel } from "./LinkToAgentPanel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
  description: "Flags uncovered branches",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a test-quality reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const NEW_SKILL: SkillSummary = {
  id: "sk-new",
  name: "repo-conventions",
  description: "House conventions merged from 2 accepted findings.",
  type: "convention",
  source: "extracted",
  body: "# repo-conventions",
  enabled: true,
  version: 1,
  evidence_files: ["src/api/users.ts"],
  token_estimate: 40,
  injection_flagged: false,
  injection_patterns: [],
  used_by: 0,
};

interface Call {
  method: string;
  url: string;
  body: unknown;
}

function mockFetch(opts: { agents?: Agent[]; linkedSkills?: AgentSkillDetail[]; allSkills?: SkillSummary[] }): Call[] {
  const calls: Call[] = [];
  const agents = opts.agents ?? [AGENT];
  const linkedSkills = opts.linkedSkills ?? [];
  const allSkills = opts.allSkills ?? [NEW_SKILL];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    let json: unknown = [];
    if (method === "GET" && url.endsWith("/agents")) json = agents;
    else if (method === "GET" && url.includes("/agents/") && url.endsWith("/skills")) json = linkedSkills;
    else if (method === "GET" && url.endsWith("/skills")) json = allSkills;
    else if (method === "POST") json = body?.skills ?? [];
    return { ok: true, status: 200, json: async () => json } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderPanel(skillIds: string[] = [NEW_SKILL.id]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <LinkToAgentPanel skillIds={skillIds} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("LinkToAgentPanel", () => {
  it("shows the no-agents state when the workspace has none", async () => {
    mockFetch({ agents: [] });
    renderPanel();
    expect(await screen.findByText("No agents yet — create one first")).toBeInTheDocument();
  });

  it("disables Link until an agent is picked", async () => {
    mockFetch({});
    renderPanel();
    await screen.findByText("Test Quality Reviewer");
    expect(screen.getByRole("button", { name: "Link" })).toBeDisabled();
  });

  it("links the new skill to the picked agent and shows confirmation", async () => {
    const calls = mockFetch({});
    renderPanel();
    await screen.findByText("Test Quality Reviewer");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ag1" } });
    // The button stays disabled until the agent's current links have loaded
    // (linking blind could silently drop them) — wait for that before clicking.
    await waitFor(() => expect(screen.getByRole("button", { name: "Link" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    expect(await screen.findByText("Linked to Test Quality Reviewer")).toBeInTheDocument();
    const post = calls.find((c) => c.method === "POST");
    expect((post?.body as { skills: { skill_id: string; enabled: boolean }[] }).skills).toEqual([
      { skill_id: "sk-new", enabled: true },
    ]);
  });

  it("appends after an agent's existing links instead of replacing them", async () => {
    const existing: AgentSkillDetail = {
      id: "sk-old",
      name: "existing-skill",
      description: "already linked",
      type: "custom",
      source: "manual",
      body: "…",
      enabled: true,
      version: 1,
      token_estimate: 10,
      injection_flagged: false,
      injection_patterns: [],
      order: 0,
      link_enabled: true,
    };
    const calls = mockFetch({ linkedSkills: [existing] });
    renderPanel();
    await screen.findByText("Test Quality Reviewer");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "ag1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Link" })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    await screen.findByText("Linked to Test Quality Reviewer");
    const post = calls.find((c) => c.method === "POST");
    const ids = (post?.body as { skills: { skill_id: string }[] }).skills.map((sk) => sk.skill_id);
    expect(ids).toEqual(["sk-old", "sk-new"]);
  });
});
