import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@/lib/types";
import type { DiffFindingsApi } from "../findings";
import shellMessages from "../../../../messages/en/shell.json";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { FileCard } from "./FileCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

// Same shape as the seeded src/config.ts patch (findings.test.ts's fixture):
// its added line is new-file line 10.
const FILE: PrFile = {
  path: "src/config.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -8,3 +8,4 @@\n export const config = {\n   port: 3001,\n+  secret: 'x',\n };",
};

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 10,
    end_line: 10,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    scope: null,
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function findingsApi(byPath: FindingRecord[]): DiffFindingsApi {
  return {
    byPath: new Map([["src/config.ts", byPath]]),
    renderFinding: (f) => <div key={f.id}>rendered:{f.title}</div>,
  };
}

describe("FileCard", () => {
  it("renders unchanged (no dot, no cards) when no Smart Diff findings are injected", () => {
    renderWithIntl(<FileCard file={FILE} />);
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.queryByTitle("Has findings")).not.toBeInTheDocument();
  });

  it("shows the dot, an anchored FindingCard under its line, and an unanchored block for a line outside the patch", () => {
    const anchored = finding({ id: "f1", start_line: 10 });
    const unanchored = finding({ id: "f2", title: "Unrelated", start_line: 999 });
    renderWithIntl(<FileCard file={FILE} findings={findingsApi([anchored, unanchored])} />);

    expect(screen.getByTitle("Has findings")).toBeInTheDocument();
    expect(screen.getByText("blocker")).toBeInTheDocument(); // CRITICAL line label
    expect(screen.getByText("rendered:Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("rendered:Unrelated")).toBeInTheDocument();
    expect(
      screen.getByText("Findings not shown inline (their line isn't in this diff)"),
    ).toBeInTheDocument();
  });

  it("still renders a dismissed-only finding inline but does not light up the dot", () => {
    const dismissed = finding({ dismissed_at: "2026-01-01T00:00:00Z" });
    renderWithIntl(<FileCard file={FILE} findings={findingsApi([dismissed])} />);

    expect(screen.queryByTitle("Has findings")).not.toBeInTheDocument();
    expect(screen.getByText("rendered:Hardcoded secret")).toBeInTheDocument();
  });
});
