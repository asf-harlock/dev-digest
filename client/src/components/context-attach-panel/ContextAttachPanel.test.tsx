import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SpecFile } from "@devdigest/shared";
import messages from "../../../messages/en/context.json";

let listing: { data?: unknown; isLoading: boolean; isError: boolean; refetch: () => void };
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => listing,
  usePreviewContextFile: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
}));

import { ContextAttachPanel } from "./ContextAttachPanel";

afterEach(cleanup);

const file = (path: string, tokens: number) => ({ path, kind: "docs", tokens, attachable: true }) as unknown as SpecFile;

function renderPanel(props: Partial<React.ComponentProps<typeof ContextAttachPanel>> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ContextAttachPanel
        repoId="r1"
        title="Project context"
        hint="hint"
        attached={[]}
        showTotal
        saving={false}
        onSave={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function withFiles(files: SpecFile[], total = files.length) {
  listing = { data: { state: "ready", files, total, scanned_at: new Date().toISOString() }, isLoading: false, isError: false, refetch: vi.fn() };
}

describe("ContextAttachPanel", () => {
  it("AC-11/AC-12/NFR-7: badge counts and token footer live inside an aria-live polite region", () => {
    withFiles([file("a.md", 100), file("b.md", 50), file("c.md", 5)]);
    renderPanel({ attached: ["a.md", "b.md"] });
    expect(screen.getByText("2 of 3 attached")).toBeInTheDocument();
    const footer = screen.getByText("≈ 150 tokens per call");
    expect(footer.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
    cleanup();

    renderPanel({ attached: ["a.md"], showTotal: false });
    expect(screen.getByText("1 attached")).toBeInTheDocument();
  });

  it("EC-13: over 16 000 tokens shows a warning naming the skipped documents", () => {
    withFiles([file("a.md", 15_000), file("b.md", 2_000)]);
    renderPanel({ attached: ["a.md", "b.md"] });
    expect(screen.getByText(/Over the 16,000-token/)).toHaveTextContent(/skip: b\.md/);
    expect(screen.getByText("≈ 15,000 tokens per call")).toBeInTheDocument();
  });

  it("EC-1: not_cloned shows the not-cloned state and no badge", () => {
    listing = { data: { state: "not_cloned", files: [], total: 0, scanned_at: "" }, isLoading: false, isError: false, refetch: vi.fn() };
    renderPanel();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(screen.queryByText(/attached/)).not.toBeInTheDocument();
  });
});
