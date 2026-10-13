/* AgentEstimate.test.tsx — SPEC-11 per-row estimate and the selection summary (AC-6, AC-7, EC-6, EC-7). */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import prReview from "../../../messages/en/prReview.json";
import { estimate } from "../../test/multi-agent-fixtures";
import { AgentEstimate } from "./AgentEstimate";
import { EstimateSummary } from "./EstimateSummary";

afterEach(cleanup);

const intl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("AgentEstimate", () => {
  it("AC-6/EC-6: shows `8.2s · $0.06`, or a lone dash for an agent without a completed run", () => {
    intl(<AgentEstimate estimate={estimate()} />);
    expect(screen.getByText("8.2s · $0.06")).toBeInTheDocument();
    cleanup();
    intl(<AgentEstimate estimate={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("EstimateSummary", () => {
  it("AC-7: labels the run estimate `parallel`", () => {
    intl(<EstimateSummary aggregate={{ durationMs: 12000, costUsd: 0.35, partial: false }} />);
    expect(screen.getByText("≈ 12.0s · $0.35")).toBeInTheDocument();
    expect(screen.getByText("parallel")).toBeInTheDocument();
    expect(screen.queryByText("partial")).not.toBeInTheDocument();
  });

  it("EC-7: adds `partial` when a checked agent's cost is unknown", () => {
    intl(<EstimateSummary aggregate={{ durationMs: 8000, costUsd: 0.1, partial: true }} />);
    expect(screen.getByText("partial")).toBeInTheDocument();
  });
});
