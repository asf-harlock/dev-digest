import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";
import { ContextDocList, type ContextDocListProps } from "./ContextDocList";

afterEach(cleanup);

const file = (path: string, extra: Record<string, unknown> = {}) =>
  ({ path, kind: "specs", tokens: 120, attachable: true, ...extra }) as unknown as SpecFile;

function setup(props: Partial<ContextDocListProps> = {}) {
  const onChange = vi.fn();
  const onRetry = vi.fn();
  const onPreview = vi.fn();
  const user = {
    click: async (el: Element) => void fireEvent.click(el),
    type: async (el: Element, value: string) => void fireEvent.change(el, { target: { value } }),
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextDocList
        files={[]}
        isLoading={false}
        isError={false}
        onRetry={onRetry}
        onPreview={onPreview}
        onChange={onChange}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { user, onChange, onRetry, onPreview };
}

describe("ContextDocList rows", () => {
  it("AC-4/NFR-6/EC-4/EC-5/EC-6: path, kind chip, tokens, named checkbox, locked and flagged rows", async () => {
    const { user, onChange } = setup({
      attached: ["docs/a.md"],
      files: [
        file("docs/a.md", { kind: "docs" }),
        file("specs/big.md", { attachable: false, unattachable_reason: "too_large" }),
        file("specs/bin.md", { attachable: false, unattachable_reason: "not_utf8" }),
        file("insights/bad.md", { kind: "insights", injection_flagged: true, injection_patterns: ["ignore previous", "system:"] }),
      ],
    });

    expect(screen.getByText("docs/a.md")).toBeInTheDocument();
    expect(screen.getAllByText("≈ 120 tokens").length).toBe(4);
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "docs/a.md" })).toBeChecked();

    expect(screen.getByRole("checkbox", { name: "specs/big.md" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "specs/bin.md" })).toBeDisabled();
    expect(screen.getByText(/Too large/)).toBeInTheDocument();
    expect(screen.getByText(/Not UTF-8/)).toBeInTheDocument();

    expect(screen.getByText("Injection detected")).toBeInTheDocument();
    expect(screen.getByTitle("Injection patterns: ignore previous, system:")).toBeInTheDocument();
    const flagged = screen.getByRole("checkbox", { name: "insights/bad.md" });
    expect(flagged).toBeEnabled();
    await user.click(flagged);
    expect(onChange).toHaveBeenCalledWith(["docs/a.md", "insights/bad.md"]);
  });

  it("NFR-6/EC-23: Move up/down are buttons that reorder; all controls disabled while saving", async () => {
    const files = [file("a.md"), file("b.md")];
    const { user, onChange } = setup({ files, attached: ["a.md", "b.md"] });
    expect(screen.getByRole("button", { name: "Move a.md up" })).toBeDisabled();
    const down = screen.getByRole("button", { name: "Move a.md down" });
    // native <button>: focusable and Enter/Space-operable without extra handlers
    expect(down.tagName).toBe("BUTTON");
    expect(down).not.toHaveAttribute("tabindex", "-1");
    down.focus();
    expect(down).toHaveFocus();
    await user.click(down);
    expect(onChange).toHaveBeenCalledWith(["b.md", "a.md"]);
    cleanup();

    setup({ files, attached: ["a.md", "b.md"], disabled: true });
    expect(screen.getByRole("checkbox", { name: "a.md" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move a.md down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move b.md up" })).toBeDisabled();
  });

  it("EC-9: missing row with Remove only when the listing is complete", async () => {
    const { user, onChange } = setup({ files: [file("a.md")], total: 1, attached: ["a.md", "gone.md"] });
    expect(screen.getByText("Missing")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Remove gone\.md/ }));
    expect(onChange).toHaveBeenCalledWith(["a.md"]);
    cleanup();

    setup({ files: [file("a.md")], total: 500, attached: ["a.md", "gone.md"] });
    expect(screen.queryByText("Missing")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });

  it("AC-16: inherited rows are read-only with the skill name", () => {
    setup({ files: [file("s.md")], attached: [], inherited: [{ path: "s.md", skillName: "my-skill" }] });
    expect(screen.getByText("via my-skill")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "s.md" })).not.toBeInTheDocument();
  });
});

describe("ContextDocList states", () => {
  it("EC-19: loading renders a busy skeleton, no rows", () => {
    setup({ isLoading: true, files: [file("a.md")] });
    expect(screen.getByLabelText("Loading documents…")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("a.md")).not.toBeInTheDocument();
  });

  it("EC-20: error shows the message and Retry calls onRetry", async () => {
    const { user, onRetry } = setup({ isError: true });
    expect(screen.getByText("Couldn’t load project context documents")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("EC-2/EC-1: empty state has no 'Add a spec file' button and differs from not_cloned", () => {
    setup();
    expect(screen.getByText("No documents found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add a spec file/i })).not.toBeInTheDocument();
    cleanup();
    setup({ notCloned: true });
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByText("No documents found")).not.toBeInTheDocument();
  });

  it("EC-21: filter with no match shows 'No documents match' and Clear filter restores rows", async () => {
    const { user } = setup({ files: [file("a.md"), file("b.md")] });
    await user.type(screen.getByRole("searchbox", { name: "Filter documents" }), "zzz");
    expect(screen.getByText("No documents match")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getByText("a.md")).toBeInTheDocument();
    expect(screen.getByText("b.md")).toBeInTheDocument();
  });
});
