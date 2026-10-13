/* AgentStatus.test.tsx — SPEC-11 NFR-8: the status is always text plus an icon, never colour alone. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import runs from "../../../../../../../../messages/en/runs.json";
import { AgentStatus } from "./AgentStatus";

afterEach(cleanup);

describe("AgentStatus", () => {
  it.each([
    ["done", "Done"],
    ["running", "Running"],
    ["failed", "Failed"],
    ["cancelled", "Cancelled"],
  ] as const)("NFR-8: %s reads %s as text beside an icon", (status, label) => {
    render(
      <NextIntlClientProvider locale="en" messages={{ runs }}>
        <AgentStatus status={status} />
      </NextIntlClientProvider>,
    );
    const el = screen.getByText(label);
    expect(el).toHaveAttribute("data-status", status);
    expect(el.querySelector("svg")).not.toBeNull();
  });
});
