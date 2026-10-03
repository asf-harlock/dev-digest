import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/context.json";

type Query = { data?: Record<string, unknown>; isLoading: boolean; isError: boolean; refetch: () => void };
let query: Query;
vi.mock("@/lib/hooks/core", () => ({ usePreviewContextFile: () => query }));

import { ContextDocPreview, type ContextDocPreviewProps } from "./ContextDocPreview";

const refetch = vi.fn();
beforeEach(() => {
  refetch.mockReset();
  query = { isLoading: false, isError: false, refetch };
});
afterEach(cleanup);

const doc = (extra: Record<string, unknown> = {}) => ({
  path: "docs/a.md",
  kind: "docs",
  tokens: 120,
  used_by: 3,
  attachable: true,
  content: "# Hello\n\nbody text",
  ...extra,
});

function setup(props: Partial<ContextDocPreviewProps> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextDocPreview repoId="r1" path="docs/a.md" layout="panel" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("ContextDocPreview states", () => {
  it("loading: shows a busy skeleton, no content or error", () => {
    query = { isLoading: true, isError: false, refetch };
    const { container } = setup();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("EC-20: load error shows preview.loadError and Retry calls refetch", () => {
    query = { isLoading: false, isError: true, refetch };
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load this document");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("EC-20: no data without error is treated as a load error", () => {
    setup();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("ContextDocPreview loaded", () => {
  it("AC-5/AC-15: path, kind chip, used-by, tokens and rendered markdown (panel, no drawer)", () => {
    query.data = doc();
    setup();
    expect(screen.getByRole("region", { name: "Document preview" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("docs/a.md")).toBeInTheDocument();
    expect(screen.getByText("docs")).toBeInTheDocument();
    expect(screen.getByText("Used by 3 agents")).toBeInTheDocument();
    expect(screen.getByText("≈ 120 tokens")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("body text")).toBeInTheDocument();
    expect(screen.queryByText(/Injection detected/)).not.toBeInTheDocument();
  });

  it("AC-15: singular used-by; used_by/tokens omitted when absent", () => {
    query.data = doc({ used_by: 1, tokens: undefined });
    setup();
    expect(screen.getByText("Used by 1 agent")).toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();
  });

  it("EC-6: injection badge names the matched patterns", () => {
    query.data = doc({ injection_flagged: true, injection_patterns: ["ignore previous", "system:"] });
    setup();
    expect(screen.getByText("Injection detected")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("ignore previous, system:");
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
  });

  it("shows the offending line for each matched pattern", () => {
    query.data = doc({
      injection_flagged: true,
      injection_patterns: ["delimiter-escape"],
      injection_matches: [{ pattern: "delimiter-escape", line: 7, excerpt: "wrapped in <untrusted> tags" }],
    });
    setup();
    expect(screen.getByText("wrapped in <untrusted> tags")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("line 7");
  });

  it("EC-6: flagged without pattern names falls back to the generic badge", () => {
    query.data = doc({ injection_flagged: true });
    setup();
    expect(screen.getByText("Injection detected")).toBeInTheDocument();
  });
});

describe("ContextDocPreview large and unreadable documents", () => {
  it("a doc over the attach limit still renders, with a 'too large to attach' note naming its size", () => {
    query.data = doc({ attachable: false, unattachable_reason: "too_large", size: 34_962 + 40_000 });
    setup();
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent("Too large to attach");
    expect(note).toHaveTextContent("74 KB, over the 64 KB limit");
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
  });

  it("a doc past the preview limit shows why there is no body instead of a blank drawer", () => {
    query.data = doc({ attachable: false, unattachable_reason: "too_large", size: 300 * 1024, content: undefined });
    setup();
    expect(screen.getByRole("note")).toHaveTextContent("300 KB, too large to preview here (limit 256 KB)");
    expect(screen.queryByText("Too large to attach")).not.toBeInTheDocument();
  });

  it("a non-UTF-8 doc says it can't be previewed", () => {
    query.data = doc({ attachable: false, unattachable_reason: "not_utf8", content: undefined });
    setup();
    expect(screen.getByRole("note")).toHaveTextContent("isn’t UTF-8 text");
  });

  it("an attachable doc shows no size note", () => {
    query.data = doc();
    setup();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("ContextDocPreview layout and action", () => {
  it("EC-23: drawer layout is a dialog and renders the action (Attach toggle) above the markdown", () => {
    query.data = doc();
    const onToggle = vi.fn();
    setup({
      layout: "drawer",
      action: (
        <button aria-pressed={false} disabled={false} onClick={() => onToggle(true)}>
          Attach
        </button>
      ),
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Attach" });
    const heading = screen.getByRole("heading", { name: "Hello" });
    expect(toggle.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("drawer: onClose fires from the drawer backdrop/close control", () => {
    query.data = doc();
    const onClose = vi.fn();
    setup({ layout: "drawer", onClose });
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("panel layout without an action renders no toggle button", () => {
    query.data = doc();
    setup();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ContextDocPreview untrusted markdown", () => {
  it("UI-5: no script element, no raw HTML, javascript:/data: links neutralised", () => {
    query.data = doc({
      content: [
        "<script>alert(1)</script>",
        "",
        "[x](javascript:alert(1)) [ok](https://example.com)",
        "",
        "![i](data:image/svg+xml;base64,AAAA)",
      ].join("\n"),
    });
    const { container } = setup();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('img[src^="data:"]')).toBeNull();
    expect(screen.getByText("x").closest("a")).not.toHaveAttribute("href");
    expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute("href", "https://example.com");
  });
});
