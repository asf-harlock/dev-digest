/* CaseEditor.test.tsx — SPEC-09 Case Editor: create on both owners (AC-5..AC-9, AC-12),
   edit (AC-13, AC-14, AC-15, AC-19), read-only finding cases (EC-7), inline rejections
   (EC-1..EC-3, EC-42), discard confirmation (EC-8), escaped text (UI-3, UI-8). `fetch` is
   the outside world; hooks, api.ts and react-query are real. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase, EvalCaseDetail } from "@devdigest/shared";
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
    expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 2, severity: "WARNING", category: "bug" },
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider
        locale="en"
        messages={{ eval: evalMessages, shell: shellMessages, prReview: prReviewMessages }}
        onError={(e) => intlErrors.push(e.message)}
      >
        <CaseEditor owner={{ kind: "agent", id: "ag1" }} onClose={onClose} {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

function fillNewCase() {
  change("Name", "stripe-key-leak");
  change("PR title", "Add Stripe");
  change("Diff", TWO_FILES);
  change("Start line", "2");
  change("End line", "2");
}

describe("CaseEditor create (SPEC-09)", () => {
  it("AC-5..AC-9/AC-12: an empty editor offers the diff's files, previews the chosen file with the range outlined, and creates on the agent", async () => {
    const calls = stubApi((c) =>
      c.method === "POST" ? { status: 201, body: { id: "new1", owner_kind: "agent" } satisfies Partial<EvalCase> } : undefined,
    );
    const { onClose } = renderEditor();

    // AC-5: every field empty but the type; severity/category only for must_find.
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Expectation type")).toHaveValue("must_find");
    expect(screen.getByLabelText("Severity")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fillNewCase();

    // AC-6: the new-side paths are the file choices, the first one preselected.
    const file = screen.getByLabelText("File") as HTMLSelectElement;
    expect(within(file).getAllByRole("option").map((o) => o.textContent)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(file).toHaveValue("src/a.ts");

    // AC-8 + UI-3: only a.ts is previewed, its line 2 outlined, the markup is text.
    const preview = screen.getByRole("region", { name: "Preview of src/a.ts" });
    const marked = preview.querySelectorAll('[data-highlighted="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent('<img src=x onerror="alert(1)"> added-a');
    expect(preview.querySelector("img")).toBeNull();
    expect(within(preview).queryByText("added-b")).not.toBeInTheDocument();

    fireEvent.change(file, { target: { value: "src/b.ts" } });
    expect(screen.getByRole("region", { name: "Preview of src/b.ts" })).toHaveTextContent("added-b");

    // must_not_flag drops severity and category (EC-41).
    change("Expectation type", "must_not_flag");
    expect(screen.queryByLabelText("Severity")).not.toBeInTheDocument();
    change("Expectation type", "must_find");
    change("Severity", "CRITICAL");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toMatch(/\/agents\/ag1\/eval-cases$/);
    expect(post.body).toEqual({
      name: "stripe-key-leak",
      notes: null,
      input_diff: TWO_FILES,
      input_meta: { title: "Add Stripe", body: null },
      expectation: { type: "must_find", file: "src/b.ts", start_line: 2, end_line: 2, severity: "CRITICAL", category: null },
    });
    expect(intlErrors).toEqual([]);
  });

  it("AC-7/AC-9: hunks with no file header ask for the path as text, and a skill owner posts to its own route", async () => {
    const calls = stubApi((c) => (c.method === "POST" ? { status: 201, body: { id: "n" } } : undefined));
    const { onClose } = renderEditor({ owner: { kind: "skill", id: "sk1" } });

    change("Name", "bare");
    change("PR title", "T");
    change("Diff", "@@ -1,1 +1,2 @@\n keep\n+added");
    expect(screen.getByLabelText("File").tagName).toBe("INPUT");
    change("File", "src/typed.ts");
    change("Start line", "2");
    change("End line", "2");
    expect(screen.getByRole("region", { name: "Preview of src/typed.ts" })).toHaveTextContent("added");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "POST")!.url).toMatch(/\/skills\/sk1\/eval-cases$/);
  });

  it("EC-4/EC-1: bad lines and an oversize diff block Save with an inline message and send nothing", async () => {
    const calls = stubApi(() => undefined);
    renderEditor();
    fillNewCase();

    change("Start line", "0");
    expect(await screen.findAllByText("Enter a whole number of 1 or more")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    change("Start line", "5");
    expect(await screen.findByText("The end line must not be before the start line")).toBeInTheDocument();
    change("Start line", "2");

    change("Diff", "+".repeat(204_801));
    expect(
      await screen.findByText("The diff is larger than 200 KB — paste only the file you need"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("EC-2/EC-3/EC-42/EC-5: a 422 or 413 shows its message in the open editor with every input unchanged", async () => {
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
    expect(screen.getByLabelText("Diff")).toHaveValue(TWO_FILES);
    expect(screen.getByLabelText("Start line")).toHaveValue("2");

    // Typing again clears the message.
    change("Name", "stripe-key-leak-2");
    expect(screen.queryByText(/Some values were rejected/)).not.toBeInTheDocument();
  });

  it("EC-8: closing a dirty editor asks first and keeps it open until the user confirms; a clean one just closes", async () => {
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

describe("CaseEditor open an existing case (SPEC-09)", () => {
  it("AC-13/AC-14/AC-19: a manual case opens prefilled as 'Created manually', escapes text, and a rename sends only { name }", async () => {
    const calls = stubApi((c) => {
      if (c.method === "GET" && /\/eval-cases\/c1$/.test(c.url)) return { status: 200, body: stored() };
      if (c.method === "PATCH") return { status: 200, body: { ...stored(), name: "renamed", replaced_from_id: null } };
      return undefined;
    });
    const { onClose } = renderEditor({ caseId: "c1", onRequestDelete: vi.fn() });

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Eval case · manual-case")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("manual-case");
    expect(within(dialog).getByLabelText("PR title")).toHaveValue("A <b>title</b>");
    expect(within(dialog).getByLabelText("Start line")).toHaveValue("2");
    expect(within(dialog).getByLabelText("Severity")).toHaveValue("WARNING");
    expect(within(dialog).getByText("Created manually")).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: /Open source PR/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText("never run")).toBeInTheDocument();
    expect(dialog.querySelector("b")).toBeNull();

    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    change("Name", "renamed");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toMatch(/\/eval-cases\/c1$/);
    expect(patch.body).toEqual({ name: "renamed" });
  });

  it("B2/AC-14: a whitespace-only edit leaves Save disabled, sends no empty PATCH and closes without asking", async () => {
    const calls = stubApi((c) => (c.method === "GET" ? { status: 200, body: stored() } : undefined));
    const { onClose } = renderEditor({ caseId: "c1" });
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Eval case · manual-case");

    change("Name", "manual-case ");
    change("Start line", "02");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.submit(dialog.querySelector("form")!);
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Discard changes to this case?")).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("AC-15: editing the lines sends the whole expectation, and the Delete button asks the parent", async () => {
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

    change("End line", "3");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({
      expectation: { type: "must_find", file: "src/a.ts", start_line: 2, end_line: 3, severity: "WARNING", category: "bug" },
    });
  });

  it("EC-7/EC-6: a finding-derived case is read-only apart from name and notes, with the source link", async () => {
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
    expect(within(dialog).getByRole("link", { name: "Open source PR #7" })).toHaveAttribute("href", "/repos/r1/pulls/7");
    expect(within(dialog).queryByLabelText("PR title")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Diff")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Start line")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Created manually")).not.toBeInTheDocument();

    change("Notes", "why this matters");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ notes: "why this matters" });
  });

  it("AC-13: a case that fails to load says so inside the same dialog", async () => {
    stubApi(() => ({ status: 404, body: { error: { code: "not_found", message: "no" } } }));
    renderEditor({ caseId: "gone" });
    expect(await screen.findByText("Couldn’t load this eval case.")).toBeInTheDocument();
  });
});
