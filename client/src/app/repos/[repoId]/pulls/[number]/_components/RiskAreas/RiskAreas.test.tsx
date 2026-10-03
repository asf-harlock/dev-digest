import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

function renderRisks(props: Partial<React.ComponentProps<typeof RiskAreas>> = {}) {
  const onOpenFile = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas risks={[]} onOpenFile={onOpenFile} {...props} />
    </NextIntlClientProvider>,
  );
  return onOpenFile;
}

const LONG = "client/src/app/repos/[repoId]/context/_components/ContextPageView/ContextPageView.tsx";
const risks: Risk[] = [
  { kind: "auth", title: "Auth surface touched", explanation: "why", severity: "high", file_refs: ["src/mw.ts:12-18", LONG] },
  { kind: "dep", title: "New dependency: ioredis", explanation: "why", severity: "medium", file_refs: [] },
];

describe("RiskAreas", () => {
  it("AC-10/AC-11: one row per risk with a severity text label, its title and every file ref", () => {
    renderRisks({ risks });
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Auth surface touched")).toBeInTheDocument();
    expect(within(rows[0]!).getByText(messages.severity.high)).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("button", { name: "src/mw.ts:12-18" })).toBeInTheDocument();
    expect(within(rows[0]!).getByRole("button", { name: LONG })).toBeInTheDocument();
    expect(within(rows[1]!).getByText(messages.severity.medium)).toBeInTheDocument();
    expect(within(rows[1]!).queryByRole("button")).toBeNull();
  });

  it("AC-14: clicking a file ref deep-links to that file and the range start", () => {
    const onOpenFile = renderRisks({ risks });
    fireEvent.click(screen.getByRole("button", { name: "src/mw.ts:12-18" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/mw.ts", 12);
    fireEvent.click(screen.getByRole("button", { name: LONG }));
    expect(onOpenFile).toHaveBeenLastCalledWith(LONG, undefined);
  });

  it("long file refs wrap inside the card instead of overflowing it", () => {
    renderRisks({ risks });
    const btn = screen.getByRole("button", { name: LONG });
    expect(btn.style.overflowWrap).toBe("anywhere");
    expect(btn.style.maxWidth).toBe("100%");
  });

  it("EC-14: shows the no-risks text when the brief has no risks", () => {
    renderRisks({ risks: [] });
    expect(screen.getByText(messages.noRisks)).toBeInTheDocument();
  });

  it("AC-3: shows a skeleton, not the list, while a brief is generating", () => {
    renderRisks({ risks, loading: true });
    expect(screen.queryByText("Auth surface touched")).toBeNull();
    expect(screen.getByRole("region", { name: messages.riskAreas })).toBeInTheDocument();
  });
});
