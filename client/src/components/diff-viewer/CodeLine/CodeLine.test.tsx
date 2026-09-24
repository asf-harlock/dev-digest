import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@/lib/types";
import type { Line } from "../helpers";
import prReviewMessages from "../../../../messages/en/prReview.json";
import { CodeLine } from "./CodeLine";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const LINE: Line = { kind: "add", text: "  stripeSecretKey: 'sk_live_x',", newNo: 10 };

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "t",
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

describe("CodeLine", () => {
  it("renders a plain line with no severity bar/label or finding cards when it carries no findings", () => {
    renderWithIntl(<CodeLine ln={LINE} path="src/config.ts" threads={[]} />);
    expect(screen.getByText("stripeSecretKey: 'sk_live_x',")).toBeInTheDocument();
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
  });

  it("shows the highest-severity label and renders each finding via the injected renderFinding", () => {
    const findings = [
      finding({ id: "f1", severity: "WARNING" }),
      finding({ id: "f2", severity: "CRITICAL" }),
    ];
    renderWithIntl(
      <CodeLine
        ln={LINE}
        path="src/config.ts"
        threads={[]}
        findings={findings}
        renderFinding={(f) => <div key={f.id}>rendered:{f.id}</div>}
      />,
    );
    // CRITICAL beats WARNING for the line label, regardless of list order.
    const label = screen.getByText("blocker");
    expect(label).toBeInTheDocument();
    expect(screen.queryByText("warning")).not.toBeInTheDocument();
    // The label carries an icon before the text (WCAG AA: never colour alone).
    expect(label.querySelector("svg")).toBeInTheDocument();
    // Both findings are still rendered underneath the row.
    expect(screen.getByText("rendered:f1")).toBeInTheDocument();
    expect(screen.getByText("rendered:f2")).toBeInTheDocument();
  });

  it("ignores dismissed findings for the bar/label but still renders their cards", () => {
    const findings = [
      finding({ id: "f1", severity: "CRITICAL", dismissed_at: "2026-09-24T00:00:00Z" }),
      finding({ id: "f2", severity: "SUGGESTION" }),
    ];
    const { rerender } = renderWithIntl(
      <CodeLine
        ln={LINE}
        path="src/config.ts"
        threads={[]}
        findings={findings}
        renderFinding={(f) => <div key={f.id}>rendered:{f.id}</div>}
      />,
    );
    // The dismissed CRITICAL no longer wins; the live SUGGESTION drives the label.
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.getByText("suggestion")).toBeInTheDocument();
    expect(screen.getByText("rendered:f1")).toBeInTheDocument();

    // A line whose only finding is dismissed shows no label at all.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages }}>
        <CodeLine
          ln={LINE}
          path="src/config.ts"
          threads={[]}
          findings={[findings[0]!]}
          renderFinding={(f) => <div key={f.id}>rendered:{f.id}</div>}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByText("blocker")).not.toBeInTheDocument();
    expect(screen.queryByText("suggestion")).not.toBeInTheDocument();
    expect(screen.getByText("rendered:f1")).toBeInTheDocument();
  });
});
