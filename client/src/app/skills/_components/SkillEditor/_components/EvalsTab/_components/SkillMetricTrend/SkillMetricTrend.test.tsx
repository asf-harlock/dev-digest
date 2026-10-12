/* SkillMetricTrend.test.tsx — the skill trend at its full window (SPEC-09 AC-36, AC-37, EC-27,
   EC-28): 100 finished runs stay reachable, a run with a missing metric draws a gap in that
   series only, and a missing lift or cost reads "—". The tab wiring is in EvalsTab.test.tsx. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSkillTrendPoint } from "@devdigest/shared";
import evalMessages from "../../../../../../../../../messages/en/eval.json";
import { SkillMetricTrend } from "./SkillMetricTrend";

afterEach(cleanup);

const NO_CITATION = 7;
const NO_COST = 99;

const trend: EvalSkillTrendPoint[] = Array.from({ length: 100 }, (_, i) => ({
  run_id: `r${i}`,
  ran_at: "2026-10-01T10:05:00",
  skill_version: 1 + Math.floor(i / 25),
  carrier_agent_id: "a1",
  carrier_name: "Beta",
  carrier_version: 3,
  model: "gpt-4.1",
  recall: 0.5,
  precision: 0.6,
  citation_accuracy: i === NO_CITATION ? null : 0.9,
  lift: { recall: 0.1, precision: 0, citation_accuracy: i === NO_CITATION ? null : 0.05 },
  cost_usd: i === NO_COST ? null : 0.2,
}));

describe("SkillMetricTrend", () => {
  it("AC-36/AC-37/EC-27/EC-28: 100 runs give 100 focusable targets; a null citation is a gap in that series only; null lift and cost read '—'", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
        <SkillMetricTrend trend={trend} />
      </NextIntlClientProvider>,
    );

    const chart = screen.getByRole("img", { name: "Recall, precision and citation accuracy over the last 100 runs" });
    const targets = screen.getAllByRole("button", { name: /^v\d+ · / });
    expect(targets).toHaveLength(100);
    expect(targets.every((el) => el.tabIndex === 0)).toBe(true);

    // recall + precision plot every run; citation misses exactly one → 99 dots, a broken line.
    expect(chart.querySelectorAll("circle")).toHaveLength(100 + 100 + 99);
    const paths = chart.querySelectorAll("path");
    expect(paths[0]!.getAttribute("d")?.match(/M/g)).toHaveLength(1);
    expect(paths[2]!.getAttribute("d")?.match(/M/g)).toHaveLength(2);

    // The gap run's tooltip shows "—" for citation and its lift, not 0% / 0 pt; its cost is real.
    expect(targets[NO_CITATION]).toHaveAccessibleName(
      expect.stringContaining("With skill: recall 50%, precision 60%, citation accuracy — · Lift: recall ▲ 10 pt, precision 0 pt, citation accuracy — · Cost (both arms) $0.20"),
    );
    // EC-27: a null total cost is "—", never $0.00.
    expect(targets[NO_COST]).toHaveAccessibleName(expect.stringMatching(/Cost \(both arms\) —$/));
    act(() => targets[NO_COST]!.focus());
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("$0.00");
  });
});
