import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TourSection } from "./TourSection";

afterEach(cleanup);

function Wrap() {
  const [open, setOpen] = React.useState(true);
  return (
    <TourSection id="x" title="Section X" icon="Boxes" open={open} onToggle={() => setOpen((o) => !o)}>
      <p>inside</p>
    </TourSection>
  );
}

describe("TourSection", () => {
  it("AC-16: expanded on first load; the toggle reflects and flips aria-expanded", () => {
    render(<Wrap />);
    const btn = screen.getByRole("button", { name: /Section X/ });
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("inside")).toBeVisible();
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("inside")).not.toBeVisible();
  });
});
