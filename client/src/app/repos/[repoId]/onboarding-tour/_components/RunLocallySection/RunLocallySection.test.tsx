import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { RunLocallySection } from "./RunLocallySection";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const section = {
  kind: "run_locally" as const,
  commands: [{ command: "pnpm install" }, { command: "pnpm dev", description: "start" }],
  env_keys: ["API_KEY"],
};
const ui = (
  <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
    <RunLocallySection section={section} />
  </NextIntlClientProvider>
);

describe("RunLocallySection", () => {
  it("AC-30: copies the exact command and announces 'Copied'", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(ui);
    fireEvent.click(screen.getByRole("button", { name: "Copy command: pnpm install" }));
    expect(writeText).toHaveBeenCalledWith("pnpm install");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copied"));
  });

  it("EC-18: a denied clipboard write announces 'Copy failed'", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(ui);
    fireEvent.click(screen.getByRole("button", { name: "Copy command: pnpm dev" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copy failed"));
  });

  it("EC-15: no commands shows the empty state naming the missing fact", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
        <RunLocallySection section={undefined} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/no manifest scripts/)).toBeInTheDocument();
  });
});
