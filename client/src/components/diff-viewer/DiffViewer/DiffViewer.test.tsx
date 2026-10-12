import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { DiffViewer } from "./DiffViewer";

HTMLElement.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const patch = (text: string) => `@@ -1,2 +1,3 @@\n keep\n+${text}\n end`;
const A: PrFile = { path: "src/a.ts", additions: 1, deletions: 0, patch: patch("from-a") };
const B: PrFile = { path: "src/b.ts", additions: 500, deletions: 0, patch: patch("from-b") };

describe("DiffViewer", () => {
  it("SPEC-06 F3: without targetPath/highlightLine it renders every file as before (large ones stay collapsed) and shows the empty text", () => {
    renderWithIntl(<DiffViewer files={[A, B]} />);
    expect(screen.getByText("from-a")).toBeInTheDocument();
    expect(screen.getByText("src/b.ts")).toBeInTheDocument();
    expect(screen.queryByText("from-b")).not.toBeInTheDocument();
    expect(document.querySelector("[data-highlighted]")).toBeNull();
    cleanup();

    renderWithIntl(<DiffViewer files={[]} />);
    expect(screen.getByText(shellMessages.diffViewer.noChangedFiles)).toBeInTheDocument();
  });

  it("SPEC-06 AC-15/AC-16: targetPath opens only that file and highlights the line in it, not in other files", () => {
    // Line 2 is the added line in both files; only the target may highlight.
    renderWithIntl(<DiffViewer files={[A, B]} targetPath="src/b.ts" highlightLine={2} />);
    expect(screen.getByText("from-b")).toBeInTheDocument();
    const marked = document.querySelectorAll('[data-highlighted="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent("from-b");
  });

  it("SPEC-09 AC-8: highlightRange outlines the range's new-side lines in every file card, forces nothing open and scrolls nothing", () => {
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scroll.mockClear();
    const C: PrFile = { path: "src/c.ts", additions: 1, deletions: 0, patch: patch("from-c") };
    // New-side lines: 1 keep, 2 added, 3 end.
    renderWithIntl(<DiffViewer files={[A, B, C]} highlightRange={{ start: 2, end: 3 }} />);

    const marked = [...document.querySelectorAll('[data-highlighted="true"]')];
    expect(marked.map((el) => el.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("from-a"), expect.stringContaining("from-c")]),
    );
    expect(marked).toHaveLength(4); // lines 2 and 3 in A and in C
    expect(screen.queryByText("from-b")).not.toBeInTheDocument(); // large file stays collapsed
    expect(scroll).not.toHaveBeenCalled();
  });
});
