/* EvalCaseRow.test.tsx — the one row both Evals tabs render (SPEC-10 AC-29, AC-30, AC-39, AC-41,
   AC-49, EC-12, UI-3, UI-7): status icon with an accessible name, name, MUST FIND / MUST NOT FLAG
   badge, "expected {n} finding(s), got {m}" with recall for must_find only, the severity tag,
   Run (Phase B) between the tag and Edit, Edit with icon and text, and delete. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalExpectation } from "@devdigest/shared";
import evalMessages from "../../../messages/en/eval.json";
import { EvalCaseRow } from "./EvalCaseRow";

afterEach(cleanup);

const intlErrors: string[] = [];

const MUST_FIND: EvalExpectation = {
  type: "must_find",
  file: "src/config.ts",
  start_line: 11,
  end_line: 12,
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
};
const MUST_NOT_FLAG: EvalExpectation = { type: "must_not_flag", file: "src/a.ts", start_line: 1, end_line: 1, severity: null, category: null };

function renderRow(over: Partial<React.ComponentProps<typeof EvalCaseRow>> = {}) {
  const onOpen = vi.fn();
  const onDelete = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }} onError={(e) => intlErrors.push(e.message)}>
      <ul>
        <EvalCaseRow
          id="c1"
          name="stripe-key-leak"
          expectation={MUST_FIND}
          state="passed"
          result={{ expected: 1, got: 2 }}
          errorReason={null}
          onOpen={onOpen}
          onDelete={onDelete}
          {...over}
        />
      </ul>
    </NextIntlClientProvider>,
  );
  return { onOpen, onDelete, row: screen.getByRole("listitem") };
}

describe("EvalCaseRow result (AC-29, AC-30)", () => {
  it("AC-29/AC-30: a passed must_find case shows its state icon by name, the badge, 'expected 1 finding, got 2 · recall 100%' and the severity tag", () => {
    const { row } = renderRow();
    expect(within(row).getByRole("img", { name: "passed" })).toBeInTheDocument();
    expect(within(row).getByText("stripe-key-leak")).toBeInTheDocument();
    expect(within(row).getByText("MUST FIND")).toBeInTheDocument();
    expect(within(row).getByText("expected 1 finding, got 2 · recall 100%")).toBeInTheDocument();
    expect(within(row).getByText("CRITICAL · security")).toBeInTheDocument();
    expect(intlErrors).toEqual([]);
  });

  it("AC-30: a failed must_find case reads recall 0%; the ICU plural follows the expected count", () => {
    const { row } = renderRow({ state: "failed", result: { expected: 1, got: 0 } });
    expect(within(row).getByRole("img", { name: "failed" })).toBeInTheDocument();
    expect(within(row).getByText("expected 1 finding, got 0 · recall 0%")).toBeInTheDocument();
  });

  it("AC-29/AC-30: a must_not_flag case has its own badge, 'expected 0 findings, got n' with no recall text and no severity tag", () => {
    const { row } = renderRow({ expectation: MUST_NOT_FLAG, state: "failed", result: { expected: 0, got: 1 } });
    expect(within(row).getByText("MUST NOT FLAG")).toBeInTheDocument();
    expect(within(row).queryByText("MUST FIND")).not.toBeInTheDocument();
    expect(within(row).getByText("expected 0 findings, got 1")).toBeInTheDocument();
    expect(within(row).queryByText(/recall/)).not.toBeInTheDocument();
    expect(within(row).queryByText(/CRITICAL|security/)).not.toBeInTheDocument();
  });

  it("AC-29: a must_find case with neither severity nor category omits the tag; with only one it shows just that part", () => {
    renderRow({ expectation: { ...MUST_FIND, severity: null, category: null }, result: null, state: "never_run" });
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    cleanup();
    const { row } = renderRow({ expectation: { ...MUST_FIND, severity: "WARNING", category: null } });
    expect(within(row).getByText("WARNING")).toBeInTheDocument();
  });

  it("a never-run case has no result line; an errored one shows its reason, truncated with the full text in title", () => {
    let { row } = renderRow({ state: "never_run", result: null });
    expect(within(row).getByRole("img", { name: "never run" })).toBeInTheDocument();
    expect(within(row).queryByText(/expected/)).not.toBeInTheDocument();
    cleanup();

    ({ row } = renderRow({ state: "errored", result: null, errorReason: "provider timeout" }));
    expect(within(row).getByRole("img", { name: "errored" })).toBeInTheDocument();
    expect(within(row).getByText("errored: provider timeout")).toHaveAttribute("title", "provider timeout");
  });

  it("EC-12/UI-3/UI-7: a long or hostile name is escaped text with the full name in title", () => {
    const name = `<img src=x onerror="alert(1)">${"x".repeat(120)}`;
    const { row } = renderRow({ name });
    expect(row.querySelector("img")).toBeNull();
    expect(within(row).getByText(name)).toHaveAttribute("title", name);
  });
});

describe("EvalCaseRow actions (AC-29, AC-39, AC-41, AC-49)", () => {
  it("AC-29: Edit has an icon and the text 'Edit', and the delete icon is named after the case; both reach the parent, and the row opens the editor", () => {
    const { row, onOpen, onDelete } = renderRow();
    const edit = within(row).getByRole("button", { name: "Edit case stripe-key-leak" });
    expect(edit).toHaveTextContent("Edit");
    expect(edit.querySelector("svg")).not.toBeNull();
    fireEvent.click(edit);
    expect(onOpen).toHaveBeenCalledWith("c1");

    fireEvent.click(within(row).getByRole("button", { name: "Open eval case stripe-key-leak" }));
    expect(onOpen).toHaveBeenCalledTimes(2);

    fireEvent.click(within(row).getByRole("button", { name: "Delete case stripe-key-leak" }));
    expect(onDelete).toHaveBeenCalledWith("c1", "stripe-key-leak");
  });

  it("AC-39: with no `run` there is no Run button; with one it sits between the severity tag and Edit and starts the case without opening it", () => {
    const bare = renderRow();
    expect(within(bare.row).queryByRole("button", { name: /^Run case/ })).not.toBeInTheDocument();
    cleanup();

    const onRun = vi.fn();
    const { row, onOpen } = renderRow({ run: { onRun, running: false, disabled: false } });
    const run = within(row).getByRole("button", { name: "Run case stripe-key-leak" });
    expect(run).toHaveTextContent("Run");
    expect(run.querySelector("svg")).not.toBeNull();
    // document order: severity tag, then Run, then Edit
    const tag = within(row).getByText("CRITICAL · security");
    const edit = within(row).getByRole("button", { name: "Edit case stripe-key-leak" });
    expect(tag.compareDocumentPosition(run) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(run.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(run);
    expect(onRun).toHaveBeenCalledWith("c1");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("AC-41: the running case reads 'Running…' and cannot be started again", () => {
    const onRun = vi.fn();
    const { row } = renderRow({ run: { onRun, running: true, disabled: true, hint: "A run is in progress" } });
    const run = within(row).getByRole("button", { name: "Running case stripe-key-leak" });
    expect(run).toHaveTextContent("Running…");
    expect(run).toBeDisabled();
    fireEvent.click(run);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("AC-49/EC-19: a disabled Run keeps its reason as the title of its wrapper and does not start", () => {
    const onRun = vi.fn();
    const { row } = renderRow({ run: { onRun, running: false, disabled: true, hint: "Link this skill to an agent first" } });
    const run = within(row).getByRole("button", { name: "Run case stripe-key-leak" });
    expect(run).toBeDisabled();
    expect(run.closest("[title]")).toHaveAttribute("title", "Link this skill to an agent first");
    fireEvent.click(run);
    expect(onRun).not.toHaveBeenCalled();
  });

  it("the skill tab's effect label is rendered after the result line (trailing)", () => {
    const { row } = renderRow({ trailing: <span>effect: helped</span> });
    expect(within(row).getByText("effect: helped")).toBeInTheDocument();
  });
});
