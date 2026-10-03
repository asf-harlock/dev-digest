import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import { ArchitectureSection } from "./ArchitectureSection";

afterEach(cleanup);

const renderIt = (body: string) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <ArchitectureSection section={{ kind: "architecture", body, nodes: [], edges: [] }} />
    </NextIntlClientProvider>,
  );

describe("ArchitectureSection", () => {
  it("EC-23/UI-5: raw HTML in model prose renders as literal text, creating no element", () => {
    const { container } = renderIt('Hello <img src=x onerror="alert(1)"> and <script>alert(1)</script> <b>bold</b>');
    expect(container.querySelector("img, script, b")).toBeNull();
    expect(container.textContent).toContain("<script>alert(1)</script>");
    expect(container.textContent).toContain("<b>bold</b>");
  });

  it("EC-15: empty section shows the empty state", () => {
    renderIt("");
    expect(screen.getByText(/No architecture summary yet/)).toBeInTheDocument();
  });
});
