import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/onboarding.json";
import type { TourRankingMode } from "@devdigest/shared";
import { RankingToggle } from "./RankingToggle";
import { parseWindowDays } from "./helpers";

afterEach(cleanup);

function Harness({ canUseActivity = true }: { canUseActivity?: boolean }) {
  const [mode, setMode] = React.useState<TourRankingMode>("import_graph");
  const [days, setDays] = React.useState("180");
  return (
    <NextIntlClientProvider locale="en" messages={{ onboarding: messages }}>
      <RankingToggle mode={mode} onModeChange={setMode} days={days} onDaysChange={setDays} canUseActivity={canUseActivity} />
    </NextIntlClientProvider>
  );
}

describe("RankingToggle", () => {
  it("AC-23: import graph is the default; no days input or warning yet", () => {
    render(<Harness />);
    expect(screen.getByRole("radio", { name: "Import graph only" })).toBeChecked();
    expect(screen.queryByLabelText("Days of history")).toBeNull();
  });

  it("AC-24/25: choosing activity shows days prefilled 180 and the disk-growth warning", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Include recent activity (hotness)" }));
    expect(screen.getByLabelText("Days of history")).toHaveValue(180);
    expect(screen.getByRole("note")).toHaveTextContent(/grow on disk/);
  });

  it("bounds: out-of-range or non-integer input shows an error", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radio", { name: "Include recent activity (hotness)" }));
    const input = screen.getByLabelText("Days of history");
    for (const bad of ["6", "731", "1.5", ""]) {
      fireEvent.change(input, { target: { value: bad } });
      expect(screen.getByRole("alert")).toHaveTextContent("7 to 730");
      expect(input).toHaveAttribute("aria-invalid", "true");
    }
    for (const ok of ["7", "730"]) {
      fireEvent.change(input, { target: { value: ok } });
      expect(screen.queryByRole("alert")).toBeNull();
    }
  });

  it("EC-8: activity option is disabled with the stated reason without a clone", () => {
    render(<Harness canUseActivity={false} />);
    const radio = screen.getByRole("radio", { name: "Include recent activity (hotness)" });
    expect(radio).toBeDisabled();
    expect(radio).toHaveAccessibleDescription("No local clone — activity ranking unavailable");
  });

  it("parseWindowDays", () => {
    expect([parseWindowDays("7"), parseWindowDays("730"), parseWindowDays("6"), parseWindowDays("731"), parseWindowDays("1.5")]).toEqual([7, 730, null, null, null]);
  });
});
