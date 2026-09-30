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
    ["low", "Low complexity", "var(--ok)"],
    ["medium", "Medium complexity", "var(--warn)"],
    ["high", "High complexity", "var(--crit)"],
  ] as const)("AC-9/NFR-8: %s complexity is coloured text with the suggestion marker", (level, text, color) => {
    renderIt(level);
    // The suggestion marker stays as the tooltip and as visually hidden text for assistive tech.
    const badge = screen.getByTitle(`${text} (suggested)`).firstElementChild as HTMLElement;
    expect(badge).toHaveTextContent(`${text} (suggested)`);
    // Visible label matches the mockup; colour is per level but never the only signal.
    expect(badge.style.color).toBe(color);
    expect(badge.style.background).toBe("transparent");
    expect(badge.style.borderColor).toBe("var(--border-strong)");
  });

  it("AC-9: null or absent complexity shows only the suggestion marker", () => {
    renderIt(null);
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
    cleanup();
    renderIt(undefined);
    expect(screen.getByText("Suggestion")).toBeInTheDocument();
  });
});
