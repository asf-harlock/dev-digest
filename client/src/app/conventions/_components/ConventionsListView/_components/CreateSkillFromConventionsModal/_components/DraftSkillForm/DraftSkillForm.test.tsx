import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/conventions.json";
import type { DraftState } from "../../helpers";
import { DraftSkillForm } from "./DraftSkillForm";

afterEach(() => cleanup());

const DRAFT: DraftState = {
  name: "async-await-then-chains",
  description: "Always use async/await instead of .then() chains",
  type: "convention",
  enabled: true,
  body: "# async-await-then-chains\n\nAlways use async/await.",
  evidenceFiles: ["src/api/users.ts"],
  status: "idle",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("DraftSkillForm", () => {
  it("renders the draft's fields and an unsaved badge before it's created", () => {
    renderWithIntl(<DraftSkillForm draft={DRAFT} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue(DRAFT.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.description)).toBeInTheDocument();
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  it("editing the name calls onChange with the patch", () => {
    const onChange = vi.fn();
    renderWithIntl(<DraftSkillForm draft={DRAFT} onChange={onChange} />);
    fireEvent.change(screen.getByDisplayValue(DRAFT.name), { target: { value: "new-name" } });
    expect(onChange).toHaveBeenCalledWith({ name: "new-name" });
  });

  it("shows the inline error message once a save attempt fails", () => {
    renderWithIntl(
      <DraftSkillForm
        draft={{ ...DRAFT, status: "error", errorMessage: 'A skill named "async-await-then-chains" already exists' }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('A skill named "async-await-then-chains" already exists')).toBeInTheDocument();
  });

  it("hides the unsaved badge once the draft is saved", () => {
    renderWithIntl(<DraftSkillForm draft={{ ...DRAFT, status: "saved" }} onChange={vi.fn()} />);
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });
});
