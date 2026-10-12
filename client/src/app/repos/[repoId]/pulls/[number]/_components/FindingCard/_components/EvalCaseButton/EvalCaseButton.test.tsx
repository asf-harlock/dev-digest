/* EvalCaseButton.test.tsx — "Turn into eval case" in a finding's action row: it opens the
   seeded Case Editor instead of creating at once (SPEC-10 AC-1, AC-5, AC-10, AC-11, EC-1..EC-4).
   The draft and the review's skills are mocked at the hook boundary; everything else is real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCaseDraft, FindingRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import prReviewMessages from "../../../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../../../messages/en/eval.json";
import shellMessages from "../../../../../../../../../../messages/en/shell.json";
import type { FindingEvalCase } from "../../helpers";

const hooks = vi.hoisted(() => ({
  draft: { data: undefined as unknown, error: null as unknown, isError: false },
  requested: [] as boolean[],
  skills: { data: undefined as { skills: { skill_id: string; name: string; has_case: boolean; case_id: string | null }[] } | undefined, isSuccess: false, isLoading: false },
  refetch: vi.fn(),
}));
vi.mock("@/lib/hooks/eval", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/eval")>()),
  useEvalCaseDraft: (_id: string, enabled: boolean) => {
    hooks.requested.push(enabled);
    return { ...hooks.draft, data: enabled && !hooks.draft.isError ? hooks.draft.data : undefined, isFetching: false, refetch: hooks.refetch };
  },
}));
vi.mock("@/lib/hooks/skill-eval", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hooks/skill-eval")>()),
  useFindingSkills: () => hooks.skills,
}));

import { EvalCaseButton } from "./EvalCaseButton";

afterEach(() => {
  cleanup();
  hooks.draft = { data: undefined, error: null, isError: false };
  hooks.requested.length = 0;
  hooks.skills = { data: undefined, isSuccess: false, isLoading: false };
  hooks.refetch.mockReset();
});

type Decision = Pick<FindingRecord, "id" | "accepted_at" | "dismissed_at">;
const ACCEPTED: Decision = { id: "f1", accepted_at: "2026-09-17T00:00:00Z", dismissed_at: null };
const UNDECIDED: Decision = { id: "f1", accepted_at: null, dismissed_at: null };

const DRAFT: EvalCaseDraft = {
  name: "From finding: Hardcoded secret",
  expectation: { type: "must_find", file: "src/config.ts", start_line: 11, end_line: 11, severity: "CRITICAL", category: "security", title: "Hardcoded secret" },
  input_diff: "diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,1 +10,2 @@\n a\n+b",
  input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "Add Stripe", body: null },
  owners: [{ kind: "agent", id: "ag1", name: "Security", has_case: false, case_id: null }],
};

function ctrl(over: Partial<FindingEvalCase> = {}): FindingEvalCase {
  return { link: null, agentMissing: false, pullId: "pr1", ...over };
}

function skillsLoaded(skills: { skill_id: string; has_case: boolean }[]) {
  hooks.skills = {
    data: { skills: skills.map((s) => ({ ...s, name: s.skill_id, case_id: s.has_case ? "c" : null })) },
    isSuccess: true,
    isLoading: false,
  };
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
function tree(finding: Decision, evalCase: FindingEvalCase, onCardClick: () => void = () => {}) {
  return (
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, eval: evalMessages, shell: shellMessages }}>
        <div onClick={onCardClick}>
          <EvalCaseButton finding={finding} evalCase={evalCase} />
        </div>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
function renderButton(finding: Decision, evalCase: FindingEvalCase, onCardClick: () => void = () => {}) {
  return render(tree(finding, evalCase, onCardClick));
}

describe("EvalCaseButton (SPEC-10)", () => {
  it("AC-1/AC-5: a click reads the draft and opens the seeded editor; nothing is created", () => {
    hooks.draft.data = DRAFT;
    skillsLoaded([]);
    renderButton(ACCEPTED, ctrl());
    // Not read on mount, only on the click.
    expect(hooks.requested.every((r) => r === false)).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Seeded from an accepted finding · assert the expected output")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("From finding: Hardcoded secret");
    expect(within(dialog).getByRole("radio", { name: /Security/ })).toBeChecked();
  });

  it("B3: an open editor survives the control flipping to In eval set, and closing it does not reopen it", () => {
    hooks.draft.data = DRAFT;
    skillsLoaded([{ skill_id: "sk1", has_case: false }]);
    const view = renderButton(ACCEPTED, ctrl());
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // A 409 / save refreshes the card state: every owner now has a case.
    skillsLoaded([{ skill_id: "sk1", has_case: true }]);
    view.rerender(tree(ACCEPTED, ctrl({ link: { caseId: "c1", agentId: "ag1" } })));
    expect(screen.getByRole("link", { name: /In eval set/ })).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Closing it leaves the link only; the draft the query still holds does not reopen the editor.
    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /In eval set/ })).toBeInTheDocument();
  });

  it("B3: a 409 on the last free owner keeps the same editor mounted with its edits and shows the exists message after the card flips", async () => {
    hooks.draft.data = { ...DRAFT, owners: [{ kind: "agent", id: "ag1", name: "Security", has_case: false, case_id: null }] };
    skillsLoaded([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        statusText: "",
        json: async () => ({ error: { code: "eval_case_exists", message: "x", details: { case_id: "c9" } } }),
      })),
    );
    const view = renderButton(ACCEPTED, ctrl());
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "my edit" } });

    // What the 409's invalidations do to the card: the agent now has a case, so it flips to In eval set.
    view.rerender(tree(ACCEPTED, ctrl({ link: { caseId: "c9", agentId: "ag1" } })));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("This owner already has a case from this finding")).toBeInTheDocument();
    vi.unstubAllGlobals();

    // The card's own link (outside the dialog) and the picker's link inside it.
    expect(screen.getAllByRole("link", { name: /In eval set/ }).filter((l) => !dialog.contains(l))).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(within(dialog).getByLabelText("Name")).toHaveValue("my edit");
    expect(within(dialog).getByRole("radio", { name: /Security/ })).toBeDisabled();
  });

  it("the editor is portaled out of the card, and a click inside it does not reach the card", () => {
    hooks.draft.data = DRAFT;
    skillsLoaded([]);
    const onCardClick = vi.fn();
    const { container } = renderButton(ACCEPTED, ctrl(), onCardClick);
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    onCardClick.mockClear();
    const dialog = screen.getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    fireEvent.click(within(dialog).getByLabelText("Name"));
    expect(onCardClick).not.toHaveBeenCalled();
  });

  it("AC-1: a dismissed finding can be turned into a case as well", () => {
    skillsLoaded([]);
    renderButton({ ...UNDECIDED, dismissed_at: "2026-09-17T00:00:00Z" }, ctrl());
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });

  it("EC-1: an undecided finding is disabled and explains why", () => {
    renderButton(UNDECIDED, ctrl());
    const btn = screen.getByRole("button", { name: /Turn into eval case/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("Accept or dismiss this finding first");
    fireEvent.click(btn);
    expect(hooks.requested.every((r) => r === false)).toBe(true);
  });

  it("EC-3: a deleted agent with no recorded skill disables the button with its own reason", () => {
    skillsLoaded([]);
    renderButton(ACCEPTED, ctrl({ agentMissing: true }));
    const btn = screen.getByRole("button", { name: /Turn into eval case/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("The agent that produced this finding was deleted");
  });

  it("EC-4: a deleted agent whose review recorded a skill still opens the editor, listing only the skill", () => {
    hooks.draft.data = { ...DRAFT, owners: [{ kind: "skill", id: "sk1", name: "Secrets", has_case: false, case_id: null }] };
    skillsLoaded([{ skill_id: "sk1", has_case: false }]);
    renderButton(ACCEPTED, ctrl({ agentMissing: true }));
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    const dialog = screen.getByRole("dialog");
    const owners = within(within(dialog).getByRole("group", { name: "Add to" }));
    expect(owners.getAllByRole("radio")).toHaveLength(1);
    expect(owners.getByRole("radio", { name: /Secrets/ })).toBeChecked();
  });

  it("EC-2: a 422 of the draft read shows next to the control and no editor opens", () => {
    skillsLoaded([]);
    hooks.draft = { data: undefined, error: new ApiError("x", 422, "no_patch"), isError: true };
    renderButton(ACCEPTED, ctrl());
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This file has no diff to freeze");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    hooks.draft = { data: undefined, error: new ApiError("x", 422, "range_outside_diff"), isError: true };
    cleanup();
    renderButton(ACCEPTED, ctrl());
    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/PR changed since this review/);
  });

  it("AC-11: In eval set only when the agent and every skill have a case, linking to the first owner's Evals tab", () => {
    skillsLoaded([{ skill_id: "sk1", has_case: true }]);
    const { unmount } = renderButton(ACCEPTED, ctrl({ link: { caseId: "c1", agentId: "ag7" } }));
    expect(screen.getByRole("link", { name: /In eval set/ })).toHaveAttribute("href", "/agents/ag7?tab=evals");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    unmount();

    // A skill without a case keeps the button.
    skillsLoaded([{ skill_id: "sk1", has_case: false }]);
    renderButton(ACCEPTED, ctrl({ link: { caseId: "c1", agentId: "ag7" } }));
    expect(screen.queryByRole("link", { name: /In eval set/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });

  it("AC-11: with the agent gone and every skill done, it links to the first skill's Evals tab", () => {
    skillsLoaded([{ skill_id: "sk1", has_case: true }, { skill_id: "sk2", has_case: true }]);
    renderButton(ACCEPTED, ctrl({ agentMissing: true }));
    expect(screen.getByRole("link", { name: /In eval set/ })).toHaveAttribute("href", "/skills/sk1?tab=evals");
  });

  it("AC-9 (SPEC-08): a case outranks the current decision (flipped to undecided later it is still In eval set)", () => {
    skillsLoaded([]);
    renderButton(UNDECIDED, ctrl({ link: { caseId: "c1", agentId: "ag7" } }));
    expect(screen.getByRole("link", { name: /In eval set/ })).toBeInTheDocument();
  });

  it("waits while the skills are unknown instead of flashing the wrong control", () => {
    hooks.skills = { data: undefined, isSuccess: false, isLoading: true };
    renderButton(ACCEPTED, ctrl({ link: { caseId: "c1", agentId: "ag7" } }));
    expect(screen.queryByRole("link", { name: /In eval set/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Turn into eval case/ })).toBeDisabled();
  });

  it("NFR-7: the In eval set link is at least 24px tall", () => {
    skillsLoaded([]);
    renderButton(ACCEPTED, ctrl({ link: { caseId: "c1", agentId: "ag7" } }));
    expect(parseFloat(screen.getByRole("link", { name: /In eval set/ }).style.minHeight)).toBeGreaterThanOrEqual(24);
  });
});
