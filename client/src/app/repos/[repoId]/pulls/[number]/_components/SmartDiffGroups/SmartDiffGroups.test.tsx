import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SmartDiffGroup } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import type { DiffFindingsApi } from "@/components/diff-viewer";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import { SmartDiffGroups } from "./SmartDiffGroups";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const GROUPS: SmartDiffGroup[] = [
  { role: "core", files: [{ path: "src/api/users.ts", additions: 7, deletions: 2, finding_lines: [45] }] },
  { role: "tests", files: [{ path: "src/middleware/ratelimit.test.ts", additions: 15, deletions: 0, finding_lines: [] }] },
  { role: "wiring", files: [{ path: "src/config.ts", additions: 4, deletions: 0, finding_lines: [12] }] },
  { role: "docs", files: [{ path: "docs/rate-limiting.md", additions: 9, deletions: 0, finding_lines: [] }] },
  { role: "boilerplate", files: [{ path: "package-lock.json", additions: 1, deletions: 1, finding_lines: [] }] },
];

const FILES: PrFile[] = GROUPS.flatMap((g) =>
  g.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, patch: null })),
);

const FINDINGS: DiffFindingsApi = { byPath: new Map(), renderFinding: () => null };

describe("SmartDiffGroups", () => {
  it("renders every group header in server order, with docs/boilerplate collapsed and the rest open", () => {
    renderWithIntl(<SmartDiffGroups groups={GROUPS} files={FILES} findings={FINDINGS} />);

    const headers = screen.getAllByRole("button");
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringContaining("Core logic"),
      expect.stringContaining("Tests"),
      expect.stringContaining("Wiring"),
      expect.stringContaining("Docs"),
      expect.stringContaining("Boilerplate"),
    ]);

    // Open-by-default groups show their file immediately...
    expect(screen.getByText("src/api/users.ts")).toBeInTheDocument();
    expect(screen.getByText("src/middleware/ratelimit.test.ts")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    // ...but docs/boilerplate start collapsed, so their file isn't in the DOM yet.
    expect(screen.queryByText("docs/rate-limiting.md")).not.toBeInTheDocument();
    expect(screen.queryByText("package-lock.json")).not.toBeInTheDocument();
  });

  it("expanding a collapsed group reveals its file, and the finding count only shows for groups with findings", () => {
    renderWithIntl(<SmartDiffGroups groups={GROUPS} files={FILES} findings={FINDINGS} />);

    // core (1 file with findings) and wiring (1 file with findings) show "● 1";
    // tests/docs/boilerplate (no findings) don't.
    const counts = screen.getAllByText("● 1");
    expect(counts).toHaveLength(2);
    // Same aria-label as FileCard's per-file dot, not just a title attribute.
    for (const count of counts) {
      expect(count).toHaveAttribute("aria-label", "1 file with findings");
    }

    fireEvent.click(screen.getByText("Boilerplate"));
    expect(screen.getByText("package-lock.json")).toBeInTheDocument();
  });
});
