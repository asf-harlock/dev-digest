import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { FirstTasksSection } from "./FirstTasksSection";

afterEach(cleanup);

const renderIt = (complexity: "low" | "medium" | "high" | null | undefined) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <FirstTasksSection
        section={{
          kind: "first_tasks",
          items: [{ title: "Read it", description: "d", paths: ["src/a.ts"], complexity }],
        }}
      />
    </NextIntlClientProvider>,
  );

describe("FirstTasksSection", () => {
  it.each([
    ["low", "Low complexity (suggested)"],
    ["medium", "Medium complexity (suggested)"],
    ["high", "High complexity (suggested)"],
  ] as const)("AC-9/NFR-8: %s complexity is text with the suggestion marker", (level, text) => {
    renderIt(level);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("AC-9: null or absent complexity shows only the suggestion marker", () => {
    renderIt(null);
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
    cleanup();
    renderIt(undefined);
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
  });
});
