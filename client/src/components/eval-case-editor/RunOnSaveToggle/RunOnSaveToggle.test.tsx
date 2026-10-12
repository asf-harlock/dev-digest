/* RunOnSaveToggle.test.tsx — the footer toggle (SPEC-10 AC-33, EC-19, NFR-10): a role="switch"
   named by its visible label, off by default, a native button (so Enter and Space work), and disabled with
   its reason when the skill has no linked agent. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../../messages/en/eval.json";
import { RunOnSaveToggle } from "./RunOnSaveToggle";

afterEach(cleanup);

function renderToggle(props: Partial<React.ComponentProps<typeof RunOnSaveToggle>> = {}) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <RunOnSaveToggle on={false} onChange={onChange} {...props} />
    </NextIntlClientProvider>,
  );
  return { onChange };
}

describe("RunOnSaveToggle", () => {
  it("AC-33/NFR-10: is a switch named 'Run on save', off, focusable (a native button) and turns on with a click", () => {
    const { onChange } = renderToggle();
    const toggle = screen.getByRole("switch", { name: "Run on save" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle.tagName).toBe("BUTTON");
    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it("reflects the state it is given and offers the way back", () => {
    const { onChange } = renderToggle({ on: true });
    const toggle = screen.getByRole("switch", { name: "Run on save" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("EC-19: disabled with a reason, the reason is its title and its accessible description, and it never toggles", () => {
    const { onChange } = renderToggle({ disabledReason: "Link this skill to an agent first" });
    const toggle = screen.getByRole("switch", { name: "Run on save" });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAccessibleDescription("Link this skill to an agent first");
    expect(toggle.closest("[title]")).toHaveAttribute("title", "Link this skill to an agent first");
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});
