/* CaseEditor.test.tsx — the Case Editor: create on both owners (SPEC-09), the two-column layout
   with the Input tabs, Expected output and Actual output (SPEC-10 AC-14..AC-26), a draft seeded
   from a finding with the owner picker (AC-4..AC-6, EC-5), edit (SPEC-09 AC-13..AC-15), read-only
   finding cases (AC-13), inline rejections, discard confirmation (EC-10), escaped text (UI-4) and
   the layout styles (NFR-11). `fetch` is the outside world; hooks, api.ts and react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase, EvalCaseDetail, EvalCaseDraft } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { CaseEditor } from "./CaseEditor";

const intlErrors: string[] = [];

afterEach(() => {
  intlErrors.length = 0;
  cleanup();
  vi.unstubAllGlobals();
});

const TWO_FILES = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,1 +1,2 @@",
  " keep",
  '+<img src=x onerror="alert(1)"> added-a',
  "diff --git a/src/b.ts b/src/b.ts",
  "--- a/src/b.ts",
  "+++ b/src/b.ts",
  "@@ -5,1 +5,2 @@",
  " ctx",
  "+added-b",
].join("\n");

function stored(over: Partial<EvalCaseDetail> = {}): EvalCaseDetail {
  return {
    id: "c1",
    owner_kind: "agent",
    owner_id: "ag1",
    name: "manual-case",
    input_diff: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n keep\n+added",
    input_meta: { pr_number: null, repo_full_name: null, title: "A <b>title</b>", body: null },
    expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "WARNING", category: "bug", title: null },
    source_finding_id: null,
    notes: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    source: null,
    latest_result: null,
    ...over,
  };
}

interface Call { method: string; url: string; body: unknown }
interface Reply { status: number; body?: unknown }

function stubApi(handler: (call: Call) => Reply | undefined): Call[] {
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
      const r = handler(call) ?? { status: 200, body: null };
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        statusText: "",
        json: async () => r.body,
      } as Response;
    }),
  );
  return calls;
}

function renderEditor(props: Partial<React.ComponentProps<typeof CaseEditor>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ eval: evalMessages, shell: shellMessages, prReview: prReviewMessages }}
        onError={(e) => intlErrors.push(e.message)}
      >
        <CaseEditor owner={{ kind: "agent", id: "ag1" }} onClose={onClose} onSaved={onSaved} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onClose, onSaved };
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
/** The Diff pane. By role, because the tab panel it sits in is also labelled "Diff". */
const diffBox = () => screen.getByRole("textbox", { name: "Diff" });
const changeDiff = (value: string) => fireEvent.change(diffBox(), { target: { value } });
const openTab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));
/** A save keeps the editor open on the stored case, which can then be run straight away. */
const runCaseEnabled = () => waitFor(() => expect(screen.getByRole("button", { name: "Run case" })).toBeEnabled());

/** An Expected output text for the first file of TWO_FILES. */
const expectedAt = (over: Record<string, unknown> = {}) =>
  JSON.stringify([{ file: "src/a.ts", start_line: 2, end_line: 2, severity: null, category: null, title: null, ...over }]);

function fillNewCase() {
  change("Name", "stripe-key-leak");
  openTab("Diff");
  changeDiff(TWO_FILES);
  openTab("PR meta");
  change("PR title", "Add Stripe");
  change("Expected output", expectedAt({ severity: "CRITICAL" }));
}

describe("CaseEditor create (SPEC-09, SPEC-10)", () => {
  it("AC-14..AC-21/AC-25: a blank editor is two columns, offers the skeleton, shows the type banner and creates on the agent", async () => {
    const calls = stubApi((c) =>
      c.method === "POST" ? { status: 201, body: { id: "new1", owner_kind: "agent" } satisfies Partial<EvalCase> } : undefined,
    );
    const { onClose, onSaved } = renderEditor();

    // AC-14/AC-15: header (title, subtitle, close), left column (banner, Name, Input tablist), right
    // column (Expected output, Actual output), footer Cancel and Save, no Delete for a new case.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("New eval case")).toBeInTheDocument();
    expect(within(dialog).getByText("Assert the expected output")).toBeInTheDocument();
    expect(within(dialog).getByRole("tablist", { name: "Input" })).toBeInTheDocument();
    expect(within(dialog).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Diff", "Files", "PR meta"]);
    expect(within(dialog).getByLabelText("Name")).toHaveValue("");
    expect(within(dialog).getByText("Never run yet")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Delete case" })).not.toBeInTheDocument();
    // AC-18: the type switch defaults to Must find; AC-16: the banner follows it at once.
    expect(within(dialog).getByRole("radio", { name: "Must find" })).toBeChecked();
    expect(within(dialog).getByText("POSITIVE CASE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    // AC-21: the skeleton takes the first new-side path of the diff.
    changeDiff(TWO_FILES);
    fireEvent.click(screen.getByRole("button", { name: "+ Finding skeleton" }));
    expect(JSON.parse((screen.getByLabelText("Expected output") as HTMLTextAreaElement).value)).toEqual([
      { file: "src/a.ts", start_line: 1, end_line: 1, severity: null, category: null, title: null },
    ]);
    expect(screen.getByText("valid JSON")).toBeInTheDocument();

    // AC-17: Files lists the new-side paths with the expectation's file marked.
    openTab("Files");
    const files = within(screen.getByRole("list", { name: "Files in the diff" })).getAllByRole("listitem");
    expect(files.map((li) => li.textContent)).toEqual(["src/a.tsexpected file", "src/b.ts"]);

    // AC-16: NEGATIVE CASE follows the switch; the type comes from the switch, not from the JSON.
    fireEvent.click(screen.getByRole("radio", { name: "Must not flag" }));
    expect(screen.getByText("NEGATIVE CASE")).toBeInTheDocument();
    expect(screen.getByText("MUST NOT flag at src/a.ts:1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Must find" }));

    fillNewCase();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/agents\/ag1\/eval-cases$/);
    expect(post.body).toEqual({
      name: "stripe-key-leak",
      notes: null,
      input_diff: TWO_FILES,
      input_meta: { title: "Add Stripe", body: null },
      expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: null, title: null },
    });
    expect(intlErrors).toEqual([]);
  });

  it("AC-25/UI-4: a skill owner posts to its own route, and markup in the diff stays text", async () => {
    const calls = stubApi((c) => (c.method === "POST" ? { status: 201, body: { id: "n" } } : undefined));
    const { onClose, onSaved } = renderEditor({ owner: { kind: "skill", id: "sk1" } });

    fillNewCase();
    expect(screen.getByRole("dialog").querySelector("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(calls.find((c) => c.method === "POST")!.url).toMatch(/\/skills\/sk1\/eval-cases$/);
  });

  it("EC-6/EC-7: a bad Expected output shows why and blocks Save; over 10 KB is its own message; nothing is sent", async () => {
    const calls = stubApi(() => undefined);
    renderEditor();
    fillNewCase();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();

    change("Expected output", "{nope");
    expect(screen.getByText("invalid JSON: the text is not JSON")).toBeInTheDocument();
    expect(save).toBeDisabled();
    change("Expected output", JSON.stringify([{ file: "a", start_line: 1, end_line: 1, __proto__x: 1 }]).replace("__proto__x", "__proto__"));
    expect(screen.getByText('invalid JSON: unknown key "__proto__"')).toBeInTheDocument();
    change("Expected output", "[1]");
    expect(screen.getByText("invalid JSON: the array item must be an object")).toBeInTheDocument();
    change("Expected output", `[${" ".repeat(10_000)}]`);
    expect(screen.getByText("Expected output is larger than 10 KB")).toBeInTheDocument();
    expect(save).toBeDisabled();

    change("Expected output", expectedAt());
    expect(screen.getByText("valid JSON")).toBeInTheDocument();
    expect(save).toBeEnabled();
    openTab("Diff");
    changeDiff("+".repeat(204_801));
    expect(await screen.findByText("The diff is larger than 200 KB — paste only the file you need")).toBeInTheDocument();
    expect(save).toBeDisabled();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("EC-9/EC-42: a 422 or 413 shows its message in the open editor with every input unchanged", async () => {
    let reply: Reply = { status: 422, body: { error: { code: "no_patch", message: "x" } } };
    stubApi((c) => (c.method === "POST" ? reply : undefined));
    const { onClose } = renderEditor();
    fillNewCase();

    const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
    save();
    expect(await screen.findByText("This diff has no changed lines for the chosen file")).toBeInTheDocument();

    reply = { status: 422, body: { error: { code: "range_outside_diff", message: "x" } } };
    save();
    expect(
      await screen.findByText("The line range is outside the diff's changed lines — use new-side line numbers"),
    ).toBeInTheDocument();

    reply = { status: 413, body: undefined };
    save();
    expect(
      await screen.findByText("The diff is larger than 200 KB — paste only the file you need"),
    ).toBeInTheDocument();

    reply = { status: 422, body: { error: { code: "validation_error", message: "x" } } };
    save();
    expect(await screen.findByText(/Some values were rejected/)).toBeInTheDocument();

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("stripe-key-leak");
    expect(screen.getByLabelText("Expected output")).toHaveValue(expectedAt({ severity: "CRITICAL" }));

    // Typing again clears the message.
    change("Name", "stripe-key-leak-2");
    expect(screen.queryByText(/Some values were rejected/)).not.toBeInTheDocument();
  });

  it("EC-10: closing a dirty editor asks first and keeps it open until the user confirms; a clean one just closes", async () => {
    stubApi(() => undefined);
    const { onClose } = renderEditor();

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]!);
    expect(onClose).toHaveBeenCalledTimes(1); // nothing typed yet → closes at once

    change("Name", "half-typed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    const confirm = await screen.findByText("Discard changes to this case?");
    expect(confirm).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByText("Discard changes to this case?")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Name")).toHaveValue("half-typed");

    fireEvent.keyDown(window, { key: "Escape" });
    await screen.findByText("Discard changes to this case?");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("CaseEditor layout (SPEC-10 AC-23, AC-24, EC-11, NFR-11)", () => {
  it("NFR-11: the dialog is 1080px wide on a wide screen and never wider than the viewport minus the kit's 28px margins", () => {
    stubApi(() => undefined);
    const original = window.innerWidth;
    try {
      for (const [viewport, width] of [[1280, 1080], [768, 712], [700, 644], [375, 319]] as const) {
        window.innerWidth = viewport;
        renderEditor();
        expect(screen.getByRole("dialog").style.width).toBe(`${width}px`);
        cleanup();
      }
    } finally {
      window.innerWidth = original;
    }
  });

  it("clips the body and both columns, keeps the banner slot outside them and lets each text pane scroll inside itself", () => {
    stubApi(() => undefined);
    renderEditor();
    const dialog = screen.getByRole("dialog");
    const form = dialog.querySelector("form")!;
    const zero = (el: HTMLElement) => Number.parseFloat(el.style.minHeight);
    expect(zero(form)).toBe(0);
    expect(form.style.overflow).toBe("hidden");
    const [left, right] = Array.from(form.children) as HTMLElement[];
    for (const column of [left!, right!]) {
      expect(zero(column)).toBe(0);
      expect(column.style.overflow).toBe("hidden");
    }
    // The three text panes fill their block and scroll inside themselves.
    for (const pane of [diffBox(), screen.getByLabelText("Expected output"), screen.getByLabelText("Actual output")]) {
      expect(zero(pane)).toBe(0);
      expect(pane.style.overflow).toBe("auto");
    }
    // Result banner slot: in the fixed footer, outside both columns, empty in Phase A.
    const slot = dialog.querySelector('[data-slot="result-banner"]')!;
    expect(form.contains(slot)).toBe(false);
    expect(slot).toBeEmptyDOMElement();
    expect(slot).toHaveAttribute("role", "status");
  });
});

describe("CaseEditor open an existing case (SPEC-09, SPEC-10)", () => {
  it("AC-13/AC-14: a manual case opens prefilled as 'Created manually', escapes text, and a rename sends only { name }", async () => {
    const calls = stubApi((c) => {
      if (c.method === "GET" && /\/eval-cases\/c1$/.test(c.url)) return { status: 200, body: stored() };
      if (c.method === "PATCH") return { status: 200, body: { ...stored(), name: "renamed", replaced_from_id: null } };
      return undefined;
    });
    const { onClose } = renderEditor({ caseId: "c1", onRequestDelete: vi.fn() });

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Eval case · manual-case")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("manual-case");
    expect(JSON.parse((within(dialog).getByLabelText("Expected output") as HTMLTextAreaElement).value)).toEqual([
      { file: "src/a.ts", start_line: 2, end_line: 2, severity: "WARNING", category: "bug", title: null },
    ]);
    expect(within(dialog).getByText('MUST find at src/a.ts:2')).toBeInTheDocument();
    openTab("PR meta");
    expect(within(dialog).getByLabelText("PR title")).toHaveValue("A <b>title</b>");
    expect(within(dialog).getByText("Created manually")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: /Open source PR/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Never run yet")).toBeInTheDocument();
    expect(dialog.querySelector("b")).toBeNull();

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    change("Name", "renamed");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await runCaseEnabled();
    expect(onClose).not.toHaveBeenCalled();
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toMatch(/\/eval-cases\/c1$/);
    expect(patch.body).toEqual({ name: "renamed" });
  });

  it("AC-22: the grounded findings of the latest result show as a read-only JSON array; a result without findings is Never run yet (EC-13)", async () => {
    const latest = { run_id: "r1", state: "failed", expected_count: 1, got_count: 1, duration_ms: 1, cost_usd: null, error_reason: null } as const;
    stubApi((c) =>
      c.method === "GET"
        ? {
            status: 200,
            body: stored({
              latest_result: { ...latest, findings: [{ file: "src/a.ts", start_line: 9, end_line: 9, title: "<b>x</b>", severity: "INFO", category: "bug", label: "fp" }] },
            }),
          }
        : undefined,
    );
    renderEditor({ caseId: "c1" });
    const actual = (await screen.findByLabelText("Actual output")) as HTMLTextAreaElement;
    expect(actual).toHaveAttribute("readonly");
    expect(JSON.parse(actual.value)).toEqual([
      { file: "src/a.ts", start_line: 9, end_line: 9, severity: "INFO", category: "bug", title: "<b>x</b>", label: "fp" },
    ]);
    expect(screen.queryByText("Never run yet")).not.toBeInTheDocument();
    cleanup();

    stubApi((c) => (c.method === "GET" ? { status: 200, body: stored({ latest_result: { ...latest } }) } : undefined));
    renderEditor({ caseId: "c1" });
    expect(await screen.findByText("Never run yet")).toBeInTheDocument();
  });

  it("EC-8: a whitespace or key-order edit of Expected output leaves Save disabled, sends no empty PATCH and closes without asking", async () => {
    const calls = stubApi((c) => (c.method === "GET" ? { status: 200, body: stored() } : undefined));
    const { onClose } = renderEditor({ caseId: "c1" });
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Eval case · manual-case");

    change("Name", "manual-case ");
    change(
      "Expected output",
      `\n${JSON.stringify([{ title: null, category: "bug", severity: "WARNING", end_line: 2, start_line: 2, file: "src/a.ts" }], null, 4)}\n`,
    );
    expect(within(dialog).getByText("valid JSON")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.submit(dialog.querySelector("form")!);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Discard changes to this case?")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("AC-15: editing the expectation sends the whole expectation, and the Delete button asks the parent", async () => {
    const calls = stubApi((c) => {
      if (c.method === "GET") return { status: 200, body: stored() };
      if (c.method === "PATCH") return { status: 200, body: { ...stored({ id: "c2" }), replaced_from_id: "c1" } };
      return undefined;
    });
    const onRequestDelete = vi.fn();
    const { onClose } = renderEditor({ caseId: "c1", onRequestDelete });
    await screen.findByText("Eval case · manual-case");

    fireEvent.click(screen.getByRole("button", { name: "Delete case" }));
    expect(onRequestDelete).toHaveBeenCalledWith("c1", "manual-case");

    change("Expected output", expectedAt({ end_line: 3, severity: "WARNING", category: "bug" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await runCaseEnabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
      expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 3, severity: "WARNING", category: "bug", title: null },
    });
  });

  it("AC-13: a finding-derived case is read-only apart from name and notes, with the source link", async () => {
    const calls = stubApi((c) => {
      if (c.method === "GET") {
        return {
          status: 200,
          body: stored({
            source_finding_id: "f1",
            input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "Add Stripe", body: "Body" },
            source: { repo_id: "r1", pr_number: 7 },
          }),
        };
      }
      if (c.method === "PATCH") return { status: 200, body: { ...stored(), replaced_from_id: null } };
      return undefined;
    });
    const { onClose } = renderEditor({ caseId: "c1" });
    const dialog = await screen.findByRole("dialog");

    expect(await within(dialog).findByText("Created from a finding — only the name and notes can be edited")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Diff" })).toHaveAttribute("readonly");
    expect(within(dialog).getByLabelText("Expected output")).toHaveAttribute("readonly");
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "+ Finding skeleton" })).not.toBeInTheDocument();
    openTab("PR meta");
    expect(within(dialog).getByLabelText("PR title")).toHaveAttribute("readonly");
    expect(within(dialog).getByRole("link", { name: "Open source PR #7" })).toHaveAttribute("href", "/repos/r1/pulls/7");
    expect(within(dialog).queryByText("Created manually")).not.toBeInTheDocument();

    change("Notes", "why this matters");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await runCaseEnabled();
    expect(onClose).not.toHaveBeenCalled();
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ notes: "why this matters" });
  });

  it("AC-13: a case that fails to load says so inside the same dialog", async () => {
    stubApi(() => ({ status: 404, body: { error: { code: "not_found", message: "no" } } }));
    renderEditor({ caseId: "gone" });
    expect(await screen.findByText("Couldn’t load this eval case.")).toBeInTheDocument();
  });
});

describe("CaseEditor seeded from a finding (SPEC-10 AC-4..AC-6, AC-12, EC-5)", () => {
  const SEED: EvalCaseDraft = {
    name: "From finding: Hardcoded secret",
    expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "Hardcoded secret" },
    input_diff: TWO_FILES,
    input_meta: { pr_number: 7, repo_full_name: "acme/api", title: "Add Stripe", body: null },
    owners: [
      { kind: "agent", id: "ag1", name: "Security", has_case: true, case_id: "c9" },
      { kind: "skill", id: "sk1", name: "Secrets", has_case: false, case_id: null },
      { kind: "skill", id: "sk2", name: "Crypto", has_case: false, case_id: null },
    ],
  };
  const seed = (draft: EvalCaseDraft = SEED) => ({ findingId: "f1", pullId: "pr1", draft });

  it("AC-4/AC-5/AC-12: opens seeded and editable, with the owner picker preselecting the first owner without a case", () => {
    stubApi(() => undefined);
    renderEditor({ owner: null, seed: seed() });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Seeded from an accepted finding · assert the expected output")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("From finding: Hardcoded secret");
    expect(within(dialog).getByText('MUST find "Hardcoded secret" at src/a.ts:2')).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Diff" })).not.toHaveAttribute("readonly");
    expect(within(dialog).getByRole("radio", { name: "Must find" })).toBeChecked();

    // The agent already has a case: disabled, with an In eval set link to its Evals tab.
    expect(within(dialog).getByRole("radio", { name: /Security/ })).toBeDisabled();
    expect(within(dialog).getByRole("link", { name: /Security — In eval set/ })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(within(dialog).getByRole("radio", { name: /Secrets/ })).toBeChecked();
    // Untouched, the seed is saveable (nothing exists yet) and closes without a confirmation.
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("B1: + Finding skeleton only edits the text — no request, editor stays open, nothing is marked touched", async () => {
    const calls = stubApi(() => undefined);
    const { onClose } = renderEditor({ owner: null, seed: seed() });
    fireEvent.click(screen.getByRole("button", { name: "+ Finding skeleton" }));
    expect(JSON.parse((screen.getByLabelText("Expected output") as HTMLTextAreaElement).value)[0]).toMatchObject({ start_line: 1, end_line: 1 });
    // The editor reads its owner's overview on open (run controls); the click itself sends nothing.
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    cleanup();

    // With an empty name the click must not surface "required" errors (that is what a submit does).
    renderEditor({ owner: null, seed: seed({ ...SEED, name: "" }) });
    fireEvent.click(screen.getByRole("button", { name: "+ Finding skeleton" }));
    expect(screen.queryByText("Enter a name")).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("AC-4: a dismissed finding says so in the subtitle and seeds Must not flag", () => {
    stubApi(() => undefined);
    renderEditor({
      owner: null,
      seed: seed({ ...SEED, expectation: { ...SEED.expectation, type: "must_not_flag" } }),
    });
    expect(screen.getByText("Seeded from a dismissed finding · assert the expected output")).toBeInTheDocument();
    expect(screen.getByText("NEGATIVE CASE")).toBeInTheDocument();
  });

  it("AC-6: Save sends the edited draft to the skill route of the picked owner and stays open", async () => {
    const calls = stubApi((c) => (c.method === "POST" ? { status: 201, body: { id: "n", owner_kind: "skill" } } : undefined));
    const { onClose, onSaved } = renderEditor({ owner: null, seed: seed() });
    fireEvent.click(screen.getByRole("radio", { name: /Crypto/ }));
    change("Name", "mine");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/findings\/f1\/skill-eval-case$/);
    expect(post.body).toEqual({
      skill_id: "sk2",
      input: {
        name: "mine",
        notes: null,
        input_diff: TWO_FILES,
        input_meta: { title: "Add Stripe", body: null },
        expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: "security", title: "Hardcoded secret" },
      },
    });
  });

  it("AC-6: an agent owner posts the input to the agent's finding route", async () => {
    const calls = stubApi((c) => (c.method === "POST" ? { status: 201, body: { id: "n", owner_id: "ag1" } } : undefined));
    const { onClose, onSaved } = renderEditor({
      owner: null,
      seed: seed({ ...SEED, owners: [{ kind: "agent", id: "ag1", name: "Security", has_case: false, case_id: null }] }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/findings\/f1\/eval-case$/);
    expect(post.body).toMatchObject({ name: "From finding: Hardcoded secret", expectation: { type: "must_find", title: "Hardcoded secret" } });
  });

  it("EC-5: 409 eval_case_exists keeps the modal open, input unchanged, with the message and a link; no second case", async () => {
    const calls = stubApi((c) =>
      c.method === "POST" ? { status: 409, body: { error: { code: "eval_case_exists", message: "x", details: { case_id: "c9" } } } } : undefined,
    );
    const { onClose } = renderEditor({
      owner: null,
      seed: seed({ ...SEED, owners: [{ kind: "agent", id: "ag1", name: "Security", has_case: false, case_id: null }] }),
    });
    change("Name", "mine");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This owner already has a case from this finding")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Security's Evals tab" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("mine");
    expect(screen.getByRole("radio", { name: /Security/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("EC-5: the skill route's 200 with the existing case is treated alike", async () => {
    stubApi((c) => (c.method === "POST" ? { status: 200, body: { id: "c5", owner_kind: "skill" } } : undefined));
    const { onClose } = renderEditor({ owner: null, seed: seed() });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("This owner already has a case from this finding")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Secrets's Evals tab" })).toHaveAttribute("href", "/skills/sk1?tab=evals");
    expect(onClose).not.toHaveBeenCalled();

    // B4: picking another owner hides the message but keeps the taken owner disabled, with its link.
    fireEvent.click(screen.getByRole("radio", { name: /Crypto/ }));
    expect(screen.queryByText("This owner already has a case from this finding")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Secrets/ })).toBeDisabled();
    expect(screen.getByRole("link", { name: /Secrets — In eval set/ })).toHaveAttribute("href", "/skills/sk1?tab=evals");
    expect(screen.getByRole("radio", { name: /Crypto/ })).toBeChecked();
  });

  it("EC-10: an edited seed asks before it is discarded", async () => {
    stubApi(() => undefined);
    const { onClose } = renderEditor({ owner: null, seed: seed() });
    change("Name", "changed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Discard changes to this case?")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
