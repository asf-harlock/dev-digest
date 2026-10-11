/* EvalCaseButton.test.tsx — SPEC-08 "Turn into eval case" in a finding's action row
   (AC-1, AC-8, AC-9, EC-1, EC-2, EC-4, EC-5). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import type { FindingEvalCase } from "../../helpers";
import { EvalCaseButton } from "./EvalCaseButton";

afterEach(cleanup);

type Decision = Pick<FindingRecord, "id" | "accepted_at" | "dismissed_at">;
const ACCEPTED: Decision = { id: "f1", accepted_at: "2026-09-17T00:00:00Z", dismissed_at: null };
const UNDECIDED: Decision = { id: "f1", accepted_at: null, dismissed_at: null };

function ctrl(over: Partial<FindingEvalCase> = {}): FindingEvalCase {
  return { link: null, agentMissing: false, creating: false, rejection: null, onCreate: vi.fn(), ...over };
}

function renderButton(finding: Decision, evalCase: FindingEvalCase) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <EvalCaseButton finding={finding} evalCase={evalCase} />
    </NextIntlClientProvider>,
  );
}

describe("EvalCaseButton (SPEC-08)", () => {
  it("AC-1: a decided finding with a live agent has an enabled button that creates the case on click", () => {
    const evalCase = ctrl();
    renderButton(ACCEPTED, evalCase);

    fireEvent.click(screen.getByRole("button", { name: "Turn into eval case" }));
    expect(evalCase.onCreate).toHaveBeenCalledTimes(1);
  });

  it("AC-1: a dismissed finding can be turned into a case as well", () => {
    renderButton({ ...UNDECIDED, dismissed_at: "2026-09-17T00:00:00Z" }, ctrl());
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });

  it("EC-1: an undecided finding is disabled and explains why", () => {
    const evalCase = ctrl();
    renderButton(UNDECIDED, evalCase);

    const btn = screen.getByRole("button", { name: /Turn into eval case/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("Accept or dismiss this finding first");
    fireEvent.click(btn);
    expect(evalCase.onCreate).not.toHaveBeenCalled();
  });

  it("EC-2: a deleted agent disables the button with its own reason", () => {
    renderButton(ACCEPTED, ctrl({ agentMissing: true }));
    const btn = screen.getByRole("button", { name: /Turn into eval case/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription("The agent that produced this finding was deleted");
  });

  it("shows a disabled Creating… button while the request is in flight (no double submit)", () => {
    renderButton(ACCEPTED, ctrl({ creating: true }));
    expect(screen.getByRole("button", { name: /Creating/ })).toBeDisabled();
  });

  it("AC-8/AC-9: once a case exists it is an In eval set link to the agent's Evals tab, not a button", () => {
    renderButton(ACCEPTED, ctrl({ link: { caseId: "c1", agentId: "ag7" } }));
    expect(screen.getByRole("link", { name: /In eval set/ })).toHaveAttribute("href", "/agents/ag7?tab=evals");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("AC-9: a case outranks the current decision (flipped to undecided later it is still In eval set)", () => {
    renderButton(UNDECIDED, ctrl({ link: { caseId: "c1", agentId: "ag7" } }));
    expect(screen.getByRole("link", { name: /In eval set/ })).toBeInTheDocument();
  });

  it("EC-4/EC-5: a 422 shows as an inline alert with catalogue text", () => {
    const { rerender } = renderButton(ACCEPTED, ctrl({ rejection: "no_patch" }));
    expect(screen.getByRole("alert")).toHaveTextContent("This file has no diff to freeze");

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <EvalCaseButton finding={ACCEPTED} evalCase={ctrl({ rejection: "range_outside_diff" })} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/PR changed since this review/);
  });

  it("NFR-7: the In eval set link is at least 24px tall", () => {
    renderButton(ACCEPTED, ctrl({ link: { caseId: "c1", agentId: "ag7" } }));
    expect(parseFloat(screen.getByRole("link", { name: /In eval set/ }).style.minHeight)).toBeGreaterThanOrEqual(24);
  });
});
