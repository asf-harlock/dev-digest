import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { RunExtractionDropdown } from "./RunExtractionDropdown";

afterEach(() => cleanup());

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RunExtractionDropdown", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunExtractionDropdown loading={false} onRun={vi.fn()} />);
    expect(screen.getByText("Re-scan")).toBeInTheDocument();
  });

  it("shows the scanning label while loading", () => {
    renderWithIntl(<RunExtractionDropdown loading={true} onRun={vi.fn()} />);
    expect(screen.getByText("Scanning…")).toBeInTheDocument();
  });

  it("opens the menu and reports the picked mode", () => {
    const onRun = vi.fn();
    renderWithIntl(<RunExtractionDropdown loading={false} onRun={onRun} />);

    fireEvent.click(screen.getByText("Re-scan"));
    fireEvent.click(screen.getByText("Local scan"));

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith("local");
  });

  it("defaults the top item to the pooled Local + AI mode", () => {
    const onRun = vi.fn();
    renderWithIntl(<RunExtractionDropdown loading={false} onRun={onRun} />);

    fireEvent.click(screen.getByText("Re-scan"));
    fireEvent.click(screen.getByText("Local + AI (recommended)"));

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith("both");
  });
});
