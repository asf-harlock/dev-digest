/* SkillEvalMenu.test.tsx — SPEC-09 "Turn into skill eval case" (AC-48..AC-53, EC-33,
   EC-35, EC-36, EC-37, EC-44). `fetch` is the outside world; hooks, api.ts and
   react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalFindingSkills, FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { SkillEvalMenu } from "./SkillEvalMenu";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Decision = Pick<FindingRecord, "id" | "accepted_at" | "dismissed_at">;
const ACCEPTED: Decision = { id: "f1", accepted_at: "2026-10-01T00:00:00Z", dismissed_at: null };
const UNDECIDED: Decision = { id: "f1", accepted_at: null, dismissed_at: null };

interface Call { method: string; url: string; body: unknown }
interface Reply { status: number; body?: unknown }

/** A tiny server: a successful POST makes the next GET report `has_case` for that skill. */
function stubApi(skills: EvalFindingSkills, post?: () => Reply): Call[] {
  const calls: Call[] = [];
  let current = skills;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const url = String(input);
      calls.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      let r: Reply = { status: 200, body: current };
      if (method === "POST") {
        r = post?.() ?? { status: 201, body: { id: "case1" } };
        const picked = (calls[calls.length - 1]!.body as { skill_id: string }).skill_id;
        if (r.status < 300) {
          current = {
            skills: current.skills.map((sk) =>
              sk.skill_id === picked ? { ...sk, has_case: true, case_id: "case1" } : sk,
            ),
          };
        }
      }
      return { ok: r.status < 300, status: r.status, statusText: "", json: async () => r.body } as Response;
    }),
  );
  return calls;
}

function renderMenu(finding: Decision) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <SkillEvalMenu finding={finding} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const SKILLS: EvalFindingSkills = {
  skills: [
    { skill_id: "s1", name: "test-coverage-nudge", has_case: false, case_id: null },
    { skill_id: "s2", name: "<b>sql-safety</b>", has_case: true, case_id: "c7" },
  ],
};

describe("SkillEvalMenu (SPEC-09)", () => {
  it("EC-35: an undecided finding is disabled with the reason and fetches nothing", () => {
    const calls = stubApi(SKILLS);
    renderMenu(UNDECIDED);
    const btn = screen.getByRole("button", { name: "Turn into skill eval case" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("Accept or dismiss this finding first");
    expect(calls).toHaveLength(0);
  });

  it("EC-36: a review no skill shaped is disabled with its own reason", async () => {
    stubApi({ skills: [] });
    renderMenu(ACCEPTED);
    const btn = screen.getByRole("button", { name: "Turn into skill eval case" });
    await waitFor(() => expect(btn).toBeDisabled());
    expect(btn).toHaveAccessibleDescription("No skill shaped this review");
  });

  it("AC-49/AC-50/AC-52/EC-33: lists the review's skills, links the ones in the set, and picking one creates its case and flips the item", async () => {
    const calls = stubApi(SKILLS);
    renderMenu(ACCEPTED);

    const btn = screen.getByRole("button", { name: "Turn into skill eval case" });
    await waitFor(() => expect(calls.filter((c) => c.method === "GET")).toHaveLength(1));
    await waitFor(() => expect(btn).toBeEnabled());
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");

    const list = screen.getByRole("list", { name: "Skills that shaped this review" });
    // Names are escaped text, with the full name in a title.
    expect(within(list).getByText("<b>sql-safety</b>")).toBeInTheDocument();
    expect(list.querySelector("b")).toBeNull();
    const link = within(list).getByRole("link", { name: /In eval set/ });
    expect(link).toHaveAttribute("href", "/skills/s2?tab=evals");
    expect(link).toHaveAttribute("title", "<b>sql-safety</b>");
    expect(within(link).getByText("In eval set")).toBeInTheDocument();

    fireEvent.click(within(list).getByRole("button", { name: "Create a case for test-coverage-nudge" }));
    await waitFor(() =>
      expect(within(list).getAllByRole("link", { name: /In eval set/ })).toHaveLength(2),
    );
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/findings\/f1\/skill-eval-case$/);
    expect(post.body).toEqual({ skill_id: "s1" });
    expect(
      within(list).getAllByRole("link", { name: /In eval set/ }).map((a) => a.getAttribute("href")),
    ).toEqual(["/skills/s1?tab=evals", "/skills/s2?tab=evals"]);
  });

  it("EC-37/EC-44: a 422 is explained inside the open menu with the SPEC-08 texts", async () => {
    let code = "no_patch";
    stubApi(SKILLS, () => ({ status: 422, body: { error: { code, message: "x" } } }));
    renderMenu(ACCEPTED);
    const btn = screen.getByRole("button", { name: "Turn into skill eval case" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    const pick = () => fireEvent.click(screen.getByRole("button", { name: "Create a case for test-coverage-nudge" }));

    pick();
    expect(await screen.findByRole("alert")).toHaveTextContent("This file has no diff to freeze");
    code = "range_outside_diff";
    pick();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("The PR changed since this review"),
    );
    code = "skill_not_in_run";
    pick();
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("This skill was not used in this review"),
    );
    // Still a button: nothing was created.
    expect(screen.getByRole("button", { name: "Create a case for test-coverage-nudge" })).toBeEnabled();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    stubApi(SKILLS);
    renderMenu(ACCEPTED);
    const btn = screen.getByRole("button", { name: "Turn into skill eval case" });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    expect(screen.getByRole("list", { name: "Skills that shaped this review" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("list", { name: "Skills that shaped this review" })).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });
});
