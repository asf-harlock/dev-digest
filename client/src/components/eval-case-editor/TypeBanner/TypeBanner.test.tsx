/* TypeBanner.test.tsx — the POSITIVE / NEGATIVE CASE banner (SPEC-10 AC-16, AC-18, EC-12, UI-4):
   the type, the expectation's title and file:line, following the type switch at once; the switch
   only while the input is editable; escaped, truncated text with the full text in a title. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../../messages/en/eval.json";
import { TypeBanner } from "./TypeBanner";

afterEach(cleanup);

const intlErrors: string[] = [];

function renderBanner(props: Partial<React.ComponentProps<typeof TypeBanner>> = {}) {
  const onTypeChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }} onError={(e) => intlErrors.push(e.message)}>
      <TypeBanner
        type="must_find"
        facts={{ file: "src/a.ts", startLine: 2, title: "Hardcoded secret" }}
        editable
        onTypeChange={onTypeChange}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onTypeChange, banner: screen.getByTestId("type-banner") };
}

describe("TypeBanner (AC-16, AC-18)", () => {
  it("AC-16: a positive case says POSITIVE CASE and MUST find with the title and the location", () => {
    const { banner } = renderBanner();
    expect(within(banner).getByText("POSITIVE CASE")).toBeInTheDocument();
    expect(within(banner).getByText('MUST find "Hardcoded secret" at src/a.ts:2')).toBeInTheDocument();
    expect(intlErrors).toEqual([]);
  });

  it("AC-16: a negative case says NEGATIVE CASE and MUST NOT flag with the same location, and no title", () => {
    const { banner } = renderBanner({ type: "must_not_flag" });
    expect(within(banner).getByText("NEGATIVE CASE")).toBeInTheDocument();
    expect(within(banner).getByText("MUST NOT flag at src/a.ts:2")).toBeInTheDocument();
    expect(within(banner).queryByText(/Hardcoded secret/)).not.toBeInTheDocument();
  });

  it("a positive case with no title or no readable location still reads sensibly", () => {
    let { banner } = renderBanner({ facts: { file: "src/a.ts", startLine: 2, title: null } });
    expect(within(banner).getByText("MUST find at src/a.ts:2")).toBeInTheDocument();
    cleanup();
    ({ banner } = renderBanner({ facts: null }));
    expect(within(banner).getByText("MUST find")).toBeInTheDocument();
    expect(within(banner).queryByText(/src\/a\.ts/)).not.toBeInTheDocument();
    cleanup();
    ({ banner } = renderBanner({ type: "must_not_flag", facts: null }));
    expect(within(banner).getByText("MUST NOT flag")).toBeInTheDocument();
  });

  it("AC-18: the switch offers Must find and Must not flag, marks the current type and reports a change", () => {
    const { onTypeChange, banner } = renderBanner();
    expect(within(banner).getByRole("radiogroup", { name: "Expectation type" })).toBeInTheDocument();
    expect(within(banner).getByRole("radio", { name: "Must find" })).toBeChecked();
    expect(within(banner).getByRole("radio", { name: "Must not flag" })).not.toBeChecked();
    fireEvent.click(within(banner).getByRole("radio", { name: "Must not flag" }));
    expect(onTypeChange).toHaveBeenCalledWith("must_not_flag");
  });

  it("AC-13/AC-18: a locked case shows the banner without a switch", () => {
    const { banner } = renderBanner({ editable: false });
    expect(within(banner).getByText("POSITIVE CASE")).toBeInTheDocument();
    expect(within(banner).queryByRole("radio")).not.toBeInTheDocument();
  });

  it("EC-12/UI-4: a hostile or long title is escaped text and the full sentence is in title", () => {
    const title = `<img src=x onerror="alert(1)">${"t".repeat(200)}`;
    const { banner } = renderBanner({ facts: { file: "src/a.ts", startLine: 2, title } });
    expect(banner.querySelector("img")).toBeNull();
    const text = `MUST find "${title}" at src/a.ts:2`;
    expect(within(banner).getByText(text)).toHaveAttribute("title", text);
  });
});
