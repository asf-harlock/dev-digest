import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { BulkActionsBar } from "./BulkActionsBar";

afterEach(() => cleanup());

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("BulkActionsBar", () => {
  it("shows the accepted/total counter", () => {
    renderWithIntl(
      <BulkActionsBar
        acceptedCount={1}
        totalCount={3}
        allAccepted={false}
        onAcceptAll={vi.fn()}
        onDeselectAll={vi.fn()}
        onCreateSkill={vi.fn()}
      />,
    );
    expect(screen.getByText("1 of 3 accepted")).toBeInTheDocument();
  });

  it("shows Accept all when not everything is accepted, and fires onAcceptAll", () => {
    const onAcceptAll = vi.fn();
    renderWithIntl(
      <BulkActionsBar
        acceptedCount={0}
        totalCount={3}
        allAccepted={false}
        onAcceptAll={onAcceptAll}
        onDeselectAll={vi.fn()}
        onCreateSkill={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(onAcceptAll).toHaveBeenCalled();
  });

  it("shows Deselect all once every eligible candidate is accepted, and fires onDeselectAll", () => {
    const onDeselectAll = vi.fn();
    renderWithIntl(
      <BulkActionsBar
        acceptedCount={3}
        totalCount={3}
        allAccepted
        onAcceptAll={vi.fn()}
        onDeselectAll={onDeselectAll}
        onCreateSkill={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(onDeselectAll).toHaveBeenCalled();
  });

  it("disables Create skill at 0 accepted, enables it otherwise", () => {
    const { rerender } = renderWithIntl(
      <BulkActionsBar
        acceptedCount={0}
        totalCount={3}
        allAccepted={false}
        onAcceptAll={vi.fn()}
        onDeselectAll={vi.fn()}
        onCreateSkill={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <BulkActionsBar
          acceptedCount={1}
          totalCount={3}
          allAccepted={false}
          onAcceptAll={vi.fn()}
          onDeselectAll={vi.fn()}
          onCreateSkill={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
  });
});
