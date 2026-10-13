/* ViewSwitch.test.tsx — SPEC-11 Columns/Tabs toggle and the `?view=` parse (AC-27). */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../../../../../../messages/en/runs.json";
import { ViewSwitch, parseView } from ".";

afterEach(cleanup);

describe("ViewSwitch", () => {
  it("AC-27: marks the current mode pressed and reports the clicked one", () => {
    const onChange = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ runs }}>
        <ViewSwitch value="columns" onChange={onChange} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Columns" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Tabs" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Tabs" }));
    expect(onChange).toHaveBeenCalledWith("tabs");
  });

  it("AC-27: `?view=` parses to tabs, and anything else (missing, unknown) is Columns", () => {
    expect(parseView("tabs")).toBe("tabs");
    expect(parseView("columns")).toBe("columns");
    expect(parseView(null)).toBe("columns");
    expect(parseView("grid")).toBe("columns");
  });
});
