/* ResultBanner.test.tsx — the result banner slot content (SPEC-10 AC-41, AC-43, AC-44, EC-12,
   EC-21, EC-25, UI-10, NFR-10): running, passed, failed, errored with and without a reason, the
   derived 1/1 | 0/1 count (omitted when errored), duration, cost "—" for null, the skill effect. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCaseLatestResult } from "@devdigest/shared";
import evalMessages from "../../../../messages/en/eval.json";
import { ResultBanner } from "./ResultBanner";

afterEach(cleanup);

const intlErrors: string[] = [];

const base: EvalCaseLatestResult = {
  run_id: "r1",
  state: "passed",
  expected_count: 1,
  got_count: 1,
  duration_ms: 900,
  cost_usd: 0.012,
  error_reason: null,
  findings: [],
};

function renderBanner(props: React.ComponentProps<typeof ResultBanner>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }} onError={(e) => intlErrors.push(e.message)}>
      <ResultBanner {...props} />
    </NextIntlClientProvider>,
  );
}

describe("ResultBanner", () => {
  it("AC-43: a passed case reads 'Last run passed' with 1/1 passed, duration and cost", () => {
    renderBanner({ running: false, latest: base });
    expect(screen.getByText("Last run passed")).toBeInTheDocument();
    expect(screen.getByText("1/1 passed · 900ms · $0.01")).toBeInTheDocument();
    expect(intlErrors).toEqual([]);
  });

  it("AC-43: a failed case reads 'Last run failed' with 0/1 passed", () => {
    renderBanner({ running: false, latest: { ...base, state: "failed", got_count: 0, duration_ms: 12_300 } });
    expect(screen.getByText("Last run failed")).toBeInTheDocument();
    expect(screen.getByText("0/1 passed · 12.3s · $0.01")).toBeInTheDocument();
  });

  it("AC-43/EC-21: an errored case shows the reason and omits the passed count; the reason is escaped text with a title (EC-12, UI-10)", () => {
    const reason = '<img src=x onerror="alert(1)"> provider timeout';
    const { container } = renderBanner({
      running: false,
      latest: { ...base, state: "errored", expected_count: null, got_count: null, error_reason: reason },
    });
    expect(screen.getByText(`Last run errored: ${reason}`)).toHaveAttribute("title", `Last run errored: ${reason}`);
    expect(screen.getByText("900ms · $0.01")).toBeInTheDocument();
    expect(screen.queryByText(/passed ·/)).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("an errored case with no stored reason still says it errored, without a dangling colon", () => {
    renderBanner({ running: false, latest: { ...base, state: "errored", error_reason: null } });
    expect(screen.getByText("Last run errored")).toBeInTheDocument();
    expect(screen.queryByText(/errored:/)).not.toBeInTheDocument();
  });

  it("EC-25: an unknown cost is an em dash, never $0.00; an unknown duration too", () => {
    renderBanner({ running: false, latest: { ...base, cost_usd: null, duration_ms: null } });
    expect(screen.getByText("1/1 passed · — · —")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).not.toBeInTheDocument();
  });

  it("AC-44: a skill case adds its effect label next to the result", () => {
    renderBanner({ running: false, latest: { ...base, effect: "no_effect_pass" } });
    expect(screen.getByText("Effect: no effect · pass")).toBeInTheDocument();
    cleanup();
    renderBanner({ running: false, latest: { ...base, effect: "helped" } });
    expect(screen.getByText("Effect: helped")).toBeInTheDocument();
  });

  it("AC-41: while the case runs the banner says 'Running…' and shows no earlier result", () => {
    renderBanner({ running: true, latest: base });
    expect(screen.getByText("Running…")).toBeInTheDocument();
    expect(screen.queryByText("Last run passed")).not.toBeInTheDocument();
  });

  it("a case never run has no banner at all", () => {
    const { container } = renderBanner({ running: false, latest: null });
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const second = renderBanner({ running: false, latest: undefined });
    expect(second.container).toBeEmptyDOMElement();
  });
});
