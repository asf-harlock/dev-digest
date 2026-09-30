import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { CriticalPathsSection } from "./CriticalPathsSection";

afterEach(cleanup);

const section = { kind: "critical_paths" as const, items: [{ path: "src/a b.ts", reason: "entry" }] };
const renderIt = (sha: string | undefined) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <CriticalPathsSection section={section} repoFullName="acme/app" sha={sha} />
    </NextIntlClientProvider>,
  );

describe("CriticalPathsSection", () => {
  it("AC-31/UI-4: Open links to the blob at the SHA, encoded, in a new tab with noopener noreferrer", () => {
    renderIt("abc123");
    const link = screen.getByRole("link", { name: "Open src/a b.ts on GitHub" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/app/blob/abc123/src/a%20b.ts");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("AC-31: falls back to the default branch when given one", () => {
    renderIt("main");
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("/blob/main/"));
  });
});
