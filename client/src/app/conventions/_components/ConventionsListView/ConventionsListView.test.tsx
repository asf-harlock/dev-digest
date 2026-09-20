import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../messages/en/conventions.json";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/repo-not-found", () => ({
  RepoNotFound: () => <div>repo not found</div>,
}));

let activeRepo = { repoId: "r1", activeRepo: { id: "r1", full_name: "acme/payments-api" }, reposLoaded: true };
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => activeRepo,
  useRepoNotFound: () => false,
}));

const extractMutate = vi.fn();
const patchMutate = vi.fn();
let conventionsQuery: {
  data: { scan: unknown; candidates: ConventionCandidate[] } | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};
vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => conventionsQuery,
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false }),
  usePatchConvention: () => ({ mutate: patchMutate, isPending: false }),
  useDraftSkills: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: vi.fn() }),
}));

import { ConventionsListView } from "./ConventionsListView";

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  scan_id: "scan1",
  category: "style",
  rule: "Always use async/await instead of .then() chains",
  evidence: { path: "src/api/users.ts", start_line: 23, end_line: 31, snippet: "await x;" },
  confidence: 0.9,
  status: "pending",
  created_at: "2026-09-19T10:00:00.000Z",
};

afterEach(() => {
  cleanup();
  extractMutate.mockClear();
  patchMutate.mockClear();
  activeRepo = { repoId: "r1", activeRepo: { id: "r1", full_name: "acme/payments-api" }, reposLoaded: true };
});

function renderWithIntl() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsListView />
    </NextIntlClientProvider>,
  );
}

describe("ConventionsListView", () => {
  it("shows a repo-not-found state when there is no active repo", () => {
    activeRepo = { repoId: null as unknown as string, activeRepo: null as unknown as never, reposLoaded: true };
    conventionsQuery = { data: undefined, isLoading: false, isError: false, refetch: vi.fn() };
    renderWithIntl();
    expect(screen.getByText("repo not found")).toBeInTheDocument();
  });

  it("shows skeletons while loading", () => {
    conventionsQuery = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    renderWithIntl();
    expect(document.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("shows an error state with retry", () => {
    const refetch = vi.fn();
    conventionsQuery = { data: undefined, isLoading: false, isError: true, refetch };
    renderWithIntl();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the empty state and runs extraction from its CTA", () => {
    conventionsQuery = { data: { scan: null, candidates: [] }, isLoading: false, isError: false, refetch: vi.fn() };
    renderWithIntl();
    fireEvent.click(screen.getByRole("button", { name: "Run extraction" }));
    expect(extractMutate).toHaveBeenCalled();
  });

  it("renders the candidate list and the accepted counter", () => {
    conventionsQuery = {
      data: { scan: null, candidates: [CANDIDATE] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    renderWithIntl();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("0 of 1 accepted")).toBeInTheDocument();
  });

  it("re-scan opens the mode menu and triggers extraction with the picked mode", () => {
    conventionsQuery = { data: { scan: null, candidates: [CANDIDATE] }, isLoading: false, isError: false, refetch: vi.fn() };
    renderWithIntl();
    fireEvent.click(screen.getByRole("button", { name: "Re-scan" }));
    fireEvent.click(screen.getByText("Local scan"));
    expect(extractMutate).toHaveBeenCalledWith("local");
  });
});
