/* MetricTrend.test.tsx — the shared trend chart (SPEC-09 AC-36, AC-38, AC-39, EC-28, EC-30,
   NFR-8). jsdom computes no layout, so sizes are read from the inline styles. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../../messages/en/eval.json";
import { MetricTrend } from "./MetricTrend";

afterEach(cleanup);

interface Pt {
  id: string;
  version: number;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

const POINTS: Pt[] = [
  { id: "r1", version: 1, recall: 0.5, precision: 0.6, citation_accuracy: 0.9 },
  { id: "r2", version: 2, recall: null, precision: 0.7, citation_accuracy: 0.8 },
  { id: "r3", version: 3, recall: 0.8, precision: 0.75, citation_accuracy: null },
];

function renderChart(points: Pt[] = POINTS) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <MetricTrend
        points={points}
        getKey={(p) => p.id}
        getVersion={(p) => p.version}
        getValue={(p, metric) => p[metric]}
        tooltipText={(p) => `run ${p.id} · v${p.version} · <b>x</b>`}
      />
    </NextIntlClientProvider>,
  );
}

const targets = () => screen.getAllByRole("button");

describe("MetricTrend (SPEC-09)", () => {
  it("AC-36: three labelled series and a v{version} label per run on the x-axis", () => {
    renderChart();
    const legend = screen.getByRole("list");
    expect(within(legend).getByText("Recall")).toBeInTheDocument();
    expect(within(legend).getByText("Precision")).toBeInTheDocument();
    expect(within(legend).getByText("Citation")).toBeInTheDocument();
    const chart = screen.getByRole("img", { name: "Recall, precision and citation accuracy over the last 3 runs" });
    expect(within(chart).getByText("v1")).toBeInTheDocument();
    expect(within(chart).getByText("v3")).toBeInTheDocument();
  });

  it("AC-38: each run has exactly one Tab-reachable native button whose accessible name is the tooltip text", () => {
    renderChart();
    expect(targets()).toHaveLength(POINTS.length);
    targets().forEach((el, i) => {
      expect(el.tagName).toBe("BUTTON");
      expect(el.tabIndex).toBe(0);
      expect(el).toBeEnabled();
      expect(el).toHaveAccessibleName(`run r${i + 1} · v${i + 1} · <b>x</b>`);
    });

    // Focusing (what Tab does) opens the tooltip with the very same text — rendered as text, not HTML.
    const second = targets()[1]!;
    act(() => second.focus());
    expect(second).toHaveFocus();
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("run r2 · v2 · <b>x</b>");
    expect(tip.textContent).toBe(second.getAttribute("aria-label"));
    expect(tip.querySelector("b")).toBeNull();
  });

  it("AC-39: the tooltip opens on hover and closes on pointer-leave, blur and Escape", () => {
    renderChart();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // hover → open, pointer-leave → close
    fireEvent.pointerEnter(targets()[0]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("run r1");
    fireEvent.pointerLeave(targets()[0]!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // focus → open, blur → close
    act(() => targets()[2]!.focus());
    expect(screen.getByRole("tooltip")).toHaveTextContent("run r3");
    act(() => targets()[2]!.blur());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // focus → Escape closes (and keeps focus on the target)
    act(() => targets()[1]!.focus());
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(targets()[1]!, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(targets()[1]).toHaveFocus();

    // moving focus to the next run switches the tooltip to it
    act(() => targets()[0]!.focus());
    act(() => targets()[2]!.focus());
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(screen.getByRole("tooltip")).toHaveTextContent("run r3");
  });

  it("AC-39: a tooltip opened by hover alone closes on Escape, and Escape works without any focus", () => {
    renderChart();
    fireEvent.pointerEnter(targets()[1]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("run r2");
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Other keys leave it open.
    fireEvent.pointerEnter(targets()[0]!);
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("AC-39: moving the pointer off a run into empty plot space closes the tooltip, also when that run has keyboard focus", () => {
    renderChart();
    // Leaving run 1 for empty plot (no other target entered) closes it.
    fireEvent.pointerEnter(targets()[0]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("run r1");
    fireEvent.pointerLeave(targets()[0]!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Leaving a run that is still focused closes too (focus OR pointer moving away).
    act(() => targets()[2]!.focus());
    fireEvent.pointerEnter(targets()[2]!);
    fireEvent.pointerLeave(targets()[2]!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // A stale leave from a run that is no longer the open one does not close the new one.
    fireEvent.pointerEnter(targets()[0]!);
    fireEvent.pointerEnter(targets()[1]!);
    fireEvent.pointerLeave(targets()[0]!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("run r2");
  });

  it("AC-39: Escape stops propagating only while a tooltip is open, so a surrounding dialog's Escape is not swallowed otherwise", () => {
    renderChart();
    const press = () => {
      const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
      const stop = vi.spyOn(ev, "stopPropagation");
      act(() => {
        targets()[0]!.dispatchEvent(ev);
      });
      return stop;
    };
    expect(press()).not.toHaveBeenCalled();

    fireEvent.pointerEnter(targets()[0]!);
    expect(press()).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    // Closed again: Escape passes through untouched.
    expect(press()).not.toHaveBeenCalled();
  });

  it("NFR-8: every run's target is at least 24 px wide and 24 px tall", () => {
    renderChart();
    for (const el of targets()) {
      expect(parseFloat(el.style.width)).toBeGreaterThanOrEqual(24);
      expect(parseFloat(el.style.minWidth)).toBeGreaterThanOrEqual(24);
      expect(parseFloat(el.style.minHeight)).toBeGreaterThanOrEqual(24);
    }
  });

  it("EC-28: a null metric is a gap in its series — fewer plotted points, never a point at 0", () => {
    const { container } = renderChart();
    const svg = screen.getByRole("img", { name: /over the last 3 runs/ });
    const dots = svg.querySelectorAll("circle");
    // recall 2 + precision 3 + citation 2 non-null values → 7 dots, not 9.
    expect(dots).toHaveLength(7);
    // The recall series (first path) skips run 2: two separate move commands, no line between them.
    const recall = svg.querySelectorAll("path")[0]!;
    expect(recall.getAttribute("d")?.match(/M/g)).toHaveLength(2);
    expect(recall.getAttribute("d")).not.toContain("L");
    // The plot baseline (value 0) has no dot on it.
    const baseline = 14 + (1 - 0) * (240 - 14 - 30);
    expect([...dots].some((c) => Number(c.getAttribute("cy")) === baseline)).toBe(false);
    // The run with the gap is still reachable.
    expect(targets()).toHaveLength(3);
    expect(container.querySelectorAll("[data-run-target]")).toHaveLength(3);
  });

  it("EC-30: no runs shows 'No runs yet' in place of the chart", () => {
    renderChart([]);
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
