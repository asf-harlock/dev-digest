import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/context.json";

const rescanMutate = vi.fn();
let listing: Record<string, unknown>;
let rescan: Record<string, unknown>;

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/app" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/core", () => ({
  useContextFiles: () => listing,
  useRescanContext: () => rescan,
  usePreviewContextFile: () => ({ data: undefined, isLoading: true, isError: false, refetch: vi.fn() }),
}));

import { ContextPageView } from "./ContextPageView";

afterEach(() => {
  cleanup();
  rescanMutate.mockReset();
});

const files = [
  { path: "specs/a.md", kind: "specs", tokens: 10, attachable: true, used_by: 2 },
  { path: "docs/b.md", kind: "docs", tokens: 20, attachable: true },
];

function setup(data: Record<string, unknown> | undefined, over: Record<string, unknown> = {}) {
  listing = { data, isLoading: false, isError: false, refetch: vi.fn() };
  rescan = { mutate: rescanMutate, isPending: false, isSuccess: false, ...over };
  render(
    <NextIntlClientProvider locale="en" now={new Date()} messages={{ context: messages }}>
      <ContextPageView />
    </NextIntlClientProvider>,
  );
}

describe("ContextPageView", () => {
  it("AC-7/AC-9: read-only list with footer; no create/upload/folder/edit controls; Rescan fires the mutation", () => {
    setup({ state: "ready", files, total: 2, scanned_at: new Date().toISOString() });
    expect(screen.getByText("specs/a.md")).toBeInTheDocument();
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();
    expect(screen.getByText(/Last scan/)).toBeInTheDocument();
    expect(screen.queryByText(/showing/)).not.toBeInTheDocument();
    for (const name of [/create/i, /upload/i, /new folder/i, /^edit/i, /add a spec/i]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Rescan" }));
    expect(rescanMutate).toHaveBeenCalledWith("r1");
  });

  it("EC-3: capped listing reports 'showing 2 of 500'", () => {
    setup({ state: "ready", files, total: 500, scanned_at: new Date().toISOString() });
    expect(screen.getByText("showing 2 of 500")).toBeInTheDocument();
  });

  it("EC-25: Rescan is disabled and reads 'Rescanning…' while pending", () => {
    setup({ state: "ready", files, total: 2, scanned_at: new Date().toISOString() }, { isPending: true });
    expect(screen.getByRole("button", { name: /Rescanning…/ })).toBeDisabled();
  });

  it("EC-26: a fetch_failed warning shows a notice while the local list stays visible", () => {
    setup({ state: "ready", files, total: 2, scanned_at: new Date().toISOString(), warning: "fetch_failed" });
    expect(screen.getByRole("status")).toHaveTextContent(/Couldn’t update the repository/);
    expect(screen.getByText("docs/b.md")).toBeInTheDocument();
  });
});
