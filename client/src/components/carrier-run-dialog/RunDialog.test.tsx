/* RunDialog.test.tsx — the carrier dialog now shared from components/carrier-run-dialog
   (SPEC-10 NFR-19). Set mode is the SPEC-09 behaviour, unchanged (regression: AC-20..AC-22,
   EC-31, EC-46); case mode starts one case of a skill (AC-40, AC-51, EC-18, EC-19, EC-20, EC-31)
   and is held back while any run of the owner executes (AC-49). `fetch` is the outside world. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalSkillOverview } from "@devdigest/shared";
import evalMessages from "../../../messages/en/eval.json";
import skillsMessages from "../../../messages/en/skills.json";
import { RunDialog } from "./RunDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SKILL = { id: "sk1", enabled: true, injection_flagged: false };

const CARRIERS = [
  { agent_id: "a2", name: "Beta", version: 3, model: "gpt-4.1", enabled: true, link_enabled: true },
  { agent_id: "a1", name: "Alpha", version: 1, model: "claude", enabled: true, link_enabled: true },
];

function overview(over: Partial<EvalSkillOverview> = {}): EvalSkillOverview {
  return {
    skill: { id: "sk1", name: "s", version: 2, enabled: true },
    cases_total: 3,
    running_run_id: null,
    running_case_run: null,
    carriers: CARRIERS,
    latest: null,
    previous: null,
    trend: [],
    ...over,
  };
}

interface Call { method: string; url: string; body: unknown }
interface Reply { status: number; body?: unknown }

function stubApi(handler: (c: Call) => Reply = () => ({ status: 202, body: { id: "run9", status: "running" } })): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        method: init?.method ?? "GET",
        url: String(input),
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const r = handler(call);
      return { ok: r.status >= 200 && r.status < 300, status: r.status, statusText: "", json: async () => r.body } as Response;
    }),
  );
  return calls;
}

function renderDialog(props: Partial<React.ComponentProps<typeof RunDialog>> = {}) {
  const onClose = vi.fn();
  const onStarted = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages, skills: skillsMessages }}>
        <RunDialog skill={SKILL} overview={overview()} onClose={onClose} onStarted={onStarted} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onClose, onStarted, dialog: screen.getByRole("dialog") };
}

describe("RunDialog - set mode (SPEC-09 regression, NFR-19)", () => {
  it("AC-20..AC-22: preselects the first agent by name, shows '3 cases · 6 reviews' and starts the SET run with the carrier", async () => {
    const calls = stubApi();
    const { onStarted, onClose, dialog } = renderDialog();
    expect(within(dialog).getByText("Run skill evals")).toBeInTheDocument();
    expect(within(dialog).getByRole("combobox")).toHaveValue("a1");
    expect(within(dialog).getByText("3 cases · 6 reviews")).toBeInTheDocument();
    expect(within(dialog).getByText(/Every case is reviewed twice/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "a2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Run evals" }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("run9"));
    expect(onClose).toHaveBeenCalled();
    expect(calls.filter((c) => c.method === "POST")).toEqual([
      expect.objectContaining({ url: expect.stringMatching(/\/skills\/sk1\/eval-runs$/), body: { carrier_agent_id: "a2" } }),
    ]);
  });

  it("EC-31/EC-46: warns about an injection-flagged skill and a disabled link, and still allows the run", () => {
    stubApi();
    const { dialog } = renderDialog({
      skill: { ...SKILL, injection_flagged: true },
      overview: overview({ carriers: [{ ...CARRIERS[1]!, link_enabled: false }] }),
    });
    const alerts = within(dialog).getAllByRole("alert").map((a) => a.textContent);
    expect(alerts.some((a) => /flagged for prompt injection/.test(a ?? ""))).toBe(true);
    expect(alerts.some((a) => /Alpha is disabled|disabled/.test(a ?? ""))).toBe(true);
    expect(within(dialog).getByRole("button", { name: "Run evals" })).toBeEnabled();
  });
});

describe("RunDialog - case mode (AC-40, AC-51, AC-49)", () => {
  it("AC-40: titles itself for one case, shows '1 case · 2 reviews' and posts the confirmed carrier to the case route", async () => {
    const calls = stubApi();
    const { onStarted, onClose, dialog } = renderDialog({ caseId: "c1" });
    expect(within(dialog).getByText("Run skill eval case")).toBeInTheDocument();
    expect(within(dialog).getByText("1 case · 2 reviews")).toBeInTheDocument();
    expect(within(dialog).getByText(/reviewed twice by this agent/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "a2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("run9"));
    expect(onClose).toHaveBeenCalledTimes(1);
    const posts = calls.filter((c) => c.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ url: expect.stringMatching(/\/eval-cases\/c1\/run$/), body: { carrier_agent_id: "a2" } });
  });

  it("AC-20: the skill's latest carrier is preselected while it is still linked", () => {
    stubApi();
    const latest = { carrier: { agent_id: "a2" } } as unknown as EvalSkillOverview["latest"];
    const { dialog } = renderDialog({ caseId: "c1", overview: overview({ latest }) });
    expect(within(dialog).getByRole("combobox")).toHaveValue("a2");
  });

  it("EC-18: a 409 closes the dialog without following a run - the overview refetch shows the one in progress", async () => {
    const calls = stubApi(() => ({ status: 409, body: { error: { code: "eval_run_in_progress", message: "x", details: { run_id: "other" } } } }));
    const { onStarted, onClose, dialog } = renderDialog({ caseId: "c1" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onStarted).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("AC-49: while any run of the skill executes the confirm button is disabled with the reason and starts nothing", () => {
    const calls = stubApi();
    const { onStarted, dialog } = renderDialog({ caseId: "c1", confirmDisabled: true });
    const confirm = within(dialog).getByRole("button", { name: "Run case" });
    expect(confirm).toBeDisabled();
    expect(confirm.closest("[title]")).toHaveAttribute("title", "A run is in progress");
    fireEvent.click(confirm);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("EC-19: with no linked agent there is nothing to confirm", () => {
    stubApi();
    const { dialog } = renderDialog({ caseId: "c1", overview: overview({ carriers: [] }) });
    expect(within(dialog).getByRole("button", { name: "Run case" })).toBeDisabled();
  });

  it("EC-20: a disabled skill, a disabled link and an injection flag are warned about and the run is still allowed", async () => {
    const calls = stubApi();
    const { onStarted, dialog } = renderDialog({
      caseId: "c1",
      skill: { id: "sk1", enabled: false, injection_flagged: true },
    });
    expect(within(dialog).getAllByRole("alert").length).toBeGreaterThanOrEqual(2);
    fireEvent.click(within(dialog).getByRole("button", { name: "Run case" }));
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("EC-31: Cancel and Escape close the dialog and start no run", () => {
    const calls = stubApi();
    const { onClose, onStarted, dialog } = renderDialog({ caseId: "c1" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onStarted).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});
