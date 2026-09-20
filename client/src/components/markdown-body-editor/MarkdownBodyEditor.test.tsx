import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MarkdownBodyEditor } from "./MarkdownBodyEditor";

afterEach(() => cleanup());

describe("MarkdownBodyEditor", () => {
  it("renders one gutter line number per body line", () => {
    render(<MarkdownBodyEditor value={"one\ntwo\nthree"} onChange={vi.fn()} />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onChange with the new value when typed into", () => {
    const onChange = vi.fn();
    render(<MarkdownBodyEditor value="hello" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello world" } });
    expect(onChange).toHaveBeenCalledWith("hello world");
  });

  it("mirrors the textarea's scroll position onto the gutter", () => {
    render(<MarkdownBodyEditor value={"a\nb\nc"} onChange={vi.fn()} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    const gutter = textarea.previousElementSibling as HTMLDivElement;
    Object.defineProperty(textarea, "scrollTop", { value: 42, writable: true });
    fireEvent.scroll(textarea);
    expect(gutter.scrollTop).toBe(42);
  });

  it("grows rows to fit the content but never below minRows", () => {
    render(<MarkdownBodyEditor value="one line" onChange={vi.fn()} minRows={6} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "6");
  });
});
