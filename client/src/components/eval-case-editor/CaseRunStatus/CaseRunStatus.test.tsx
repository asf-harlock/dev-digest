/* CaseRunStatus.test.tsx — what an Evals tab says about the case run it follows (SPEC-10 AC-42,
   EC-23, EC-24): one polite live region announcing the final status (rendered while idle), the
   timeout sentence, and a Retry that resumes polling once a poll request failed. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../../messages/en/eval.json";
import { CaseRunStatus } from "./CaseRunStatus";

afterEach(cleanup);

function renderStatus(flow: Partial<React.ComponentProps<typeof CaseRunStatus>["flow"]> = {}) {
  const retry = vi.fn();
  const view = (f: typeof flow) => (
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <CaseRunStatus flow={{ finished: null, timedOut: false, pollFailed: false, retry, ...f }} />
    </NextIntlClientProvider>
  );
  const { rerender } = render(view(flow));
  return { retry, update: (f: typeof flow) => rerender(view(f)) };
}

describe("CaseRunStatus", () => {
  it("AC-42: the live region exists while idle and announces the final status when it arrives", () => {
    const { update } = renderStatus();
    const live = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(live).not.toBeNull();
    expect(live).toBeEmptyDOMElement();

    update({ finished: "completed" });
    expect(live).toHaveTextContent("Case run completed");
    update({ finished: "errored" });
    expect(live).toHaveTextContent("Case run failed");
    update({ finished: "partial" });
    expect(live).toHaveTextContent("Case run finished with an errored case");
  });

  it("EC-23: after the wait is over it says the run is still in progress and offers nothing to retry", () => {
    renderStatus({ timedOut: true });
    expect(screen.getByText("The eval run is still in progress — reload to check its status")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("EC-24: a failed poll shows its sentence and a Retry that resumes polling", () => {
    const { retry } = renderStatus({ pollFailed: true });
    expect(screen.getByText("Couldn’t refresh the run status.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("shows neither sentence while a run is simply running", () => {
    renderStatus();
    expect(screen.queryByText(/still in progress/)).not.toBeInTheDocument();
    expect(screen.queryByText(/refresh the run status/)).not.toBeInTheDocument();
  });
});
