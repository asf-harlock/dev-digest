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
});
