/* EvalKpiCards.test.tsx — the shared KPI row of both Evals tabs (SPEC-10 AC-27, AC-31): four
   cards of one run's metrics, the delta against the previous run spoken as text, the captions
   and the mechanical-scoring caption. No run → an em dash in every card. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../messages/en/eval.json";
import { metrics, ratio } from "../../test/eval-fixtures";
import { EvalKpiCards } from "./EvalKpiCards";

afterEach(cleanup);

const intlErrors: string[] = [];

function renderCards(props: React.ComponentProps<typeof EvalKpiCards>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }} onError={(e) => intlErrors.push(e.message)}>
      <EvalKpiCards {...props} />
    </NextIntlClientProvider>,
  );
}

describe("EvalKpiCards (AC-27, AC-31)", () => {
  it("shows Recall, Precision, Citation accuracy and Traces passed of the run, their captions and the scoring caption", () => {
    renderCards({
      latest: metrics({ cases_errored: 2 }),
      previous: metrics({ recall: ratio(0.5, 2, 4), precision: ratio(0.9, 9, 10), citation_accuracy: ratio(0.9, 9, 10) }),
    });
    const group = screen.getByRole("group", { name: "Latest eval run metrics" });
    for (const label of ["Recall", "Precision", "Citation accuracy", "Traces passed"]) {
      expect(within(group).getByText(label)).toBeInTheDocument();
    }
    expect(within(group).getByText("75%")).toBeInTheDocument();
    expect(within(group).getByText("80%")).toBeInTheDocument();
    expect(within(group).getAllByText("90%")).toHaveLength(1);
    expect(within(group).getByText("3/4")).toBeInTheDocument();
    // captions
    expect(within(group).getByText("3 of 4 must-find cases")).toBeInTheDocument();
    expect(within(group).getByText("TP 3 · FP 2 · unlabeled 5")).toBeInTheDocument();
    expect(within(group).getByText("9 of 10 findings cited a real line")).toBeInTheDocument();
    expect(within(group).getByText("2 cases errored")).toBeInTheDocument();
    // the deltas against the previous run are also spoken (the arrow glyph is not announced)
    expect(within(group).getByText("up 25 points")).toBeInTheDocument();
    expect(within(group).getByText("down 10 points")).toBeInTheDocument();
    expect(within(group).getByText("no change")).toBeInTheDocument();
    // the caption under the row
    expect(
      screen.getByText("Scoring is mechanical — a finding counts when file matches and line ranges overlap. No model call in the scorer."),
    ).toBeInTheDocument();
    expect(intlErrors).toEqual([]);
  });

  it("EC-14: with no finished run every card reads an em dash with 'No finished run yet', and no delta is claimed", () => {
    renderCards({ latest: null, previous: null });
    const group = screen.getByRole("group", { name: "Latest eval run metrics" });
    // one em dash per card value (the three ratio cards add a "no delta" dash of their own)
    expect(within(group).getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(within(group).getAllByText("No finished run yet")).toHaveLength(4);
    expect(within(group).queryByText(/points$/)).not.toBeInTheDocument();
    // the scoring caption stays: it explains the numbers that will appear
    expect(screen.getByText(/Scoring is mechanical/)).toBeInTheDocument();
  });

  it("a first run has values but no comparison to speak", () => {
    renderCards({ latest: metrics(), previous: null });
    const group = screen.getByRole("group", { name: "Latest eval run metrics" });
    expect(within(group).getByText("75%")).toBeInTheDocument();
    expect(within(group).getAllByText("no comparison available").length).toBeGreaterThan(0);
  });
});
