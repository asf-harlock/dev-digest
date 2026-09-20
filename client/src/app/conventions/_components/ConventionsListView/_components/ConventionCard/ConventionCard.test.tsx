import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(() => cleanup());

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  scan_id: "scan1",
  category: "error_handling",
  rule: "Always use async/await instead of .then() chains",
  evidence: {
    path: "src/api/users.ts",
    start_line: 23,
    end_line: 31,
    snippet: "const user = await db.users.find(id);",
  },
  confidence: 0.91,
  status: "pending",
  created_at: "2026-09-19T10:00:00.000Z",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("renders the rule, evidence citation and confidence", () => {
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onSetStatus={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("clicking Accept sets status to accepted; clicking again deselects", () => {
    const onSetStatus = vi.fn();
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onSetStatus={onSetStatus} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onSetStatus).toHaveBeenCalledWith("accepted");
  });

  it("an already-accepted card's Accept button toggles back to pending", () => {
    const onSetStatus = vi.fn();
    renderWithIntl(
      <ConventionCard candidate={{ ...CANDIDATE, status: "accepted" }} onSetStatus={onSetStatus} onSave={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(onSetStatus).toHaveBeenCalledWith("pending");
  });

  it("clicking Reject sets status to rejected", () => {
    const onSetStatus = vi.fn();
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onSetStatus={onSetStatus} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onSetStatus).toHaveBeenCalledWith("rejected");
  });

  it("entering edit mode and saving calls onSave with the edited fields, then exits edit mode", () => {
    const onSave = vi.fn();
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onSetStatus={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Always use async/await." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ category: "error_handling", rule: "Always use async/await." });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("cancel exits edit mode without calling onSave", () => {
    const onSave = vi.fn();
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onSetStatus={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });

  it("copies the evidence snippet to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderWithIntl(<ConventionCard candidate={CANDIDATE} onSetStatus={vi.fn()} onSave={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Copy snippet"));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CANDIDATE.evidence.snippet));
    await screen.findByLabelText("Copied");
  });
});
