/* OwnerPicker.test.tsx — who the case goes to (SPEC-10 AC-5, EC-5, EC-12, UI-7): each owner by
   name and kind, the chosen one checked, an owner that already has a case disabled with an
   "In eval set" link to its Evals tab, names as escaped truncated text. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseDraftOwner } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import { OwnerPicker } from "./OwnerPicker";

afterEach(cleanup);

const OWNERS: EvalCaseDraftOwner[] = [
  { kind: "agent", id: "ag1", name: "Security", has_case: true, case_id: "c9" },
  { kind: "skill", id: "sk1", name: "Secrets", has_case: false, case_id: null },
  { kind: "skill", id: "sk2", name: "Crypto", has_case: false, case_id: null },
];

function renderPicker(props: Partial<React.ComponentProps<typeof OwnerPicker>> = {}) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <OwnerPicker owners={OWNERS} taken={new Set()} value="skill:sk1" onChange={onChange} {...props} />
    </NextIntlClientProvider>,
  );
  return { onChange, group: screen.getByRole("group") };
}

describe("OwnerPicker", () => {
  it("AC-5: lists every owner by name and kind with the chosen one checked, and reports another pick", () => {
    const { onChange, group } = renderPicker();
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(within(group).getByRole("radio", { name: /Secrets/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /Crypto/ })).not.toBeChecked();
    expect(within(group).getByText("Security")).toBeInTheDocument();
    fireEvent.click(within(group).getByRole("radio", { name: /Crypto/ }));
    expect(onChange).toHaveBeenCalledWith("skill:sk2");
  });

  it("AC-5: an owner with a case is disabled and links to its Evals tab as In eval set; the others have no link", () => {
    const { group } = renderPicker();
    const agent = within(group).getByRole("radio", { name: /Security/ });
    expect(agent).toBeDisabled();
    expect(within(group).getByRole("link", { name: "Security — In eval set, open its Evals tab" })).toHaveAttribute("href", "/agents/ag1?tab=evals");
    expect(within(group).getAllByRole("link")).toHaveLength(1);
  });

  it("EC-5: an owner found to have a case since the draft was read is disabled with its link too", () => {
    const { group } = renderPicker({ taken: new Set(["skill:sk1"]), value: null });
    expect(within(group).getByRole("radio", { name: /Secrets/ })).toBeDisabled();
    expect(within(group).getByRole("link", { name: "Secrets — In eval set, open its Evals tab" })).toHaveAttribute("href", "/skills/sk1?tab=evals");
    expect(within(group).getByRole("radio", { name: /Crypto/ })).not.toBeDisabled();
  });

  it("says so when there is no owner to pick", () => {
    renderPicker({ owners: [], value: null });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByRole("group")).toHaveTextContent(/./);
  });

  it("EC-12/UI-7: a skill name that is markup stays text, and the full name is in title", () => {
    const name = `<b onclick="x()">imported</b>${"n".repeat(100)}`;
    const { group } = renderPicker({
      owners: [{ kind: "skill", id: "sk9", name, has_case: false, case_id: null }],
      value: "skill:sk9",
    });
    expect(group.querySelector("b")).toBeNull();
    expect(within(group).getByText(name)).toBeInTheDocument();
    expect(within(group).getByText(name).closest("label")).toHaveAttribute("title", name);
  });
});
