import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/conventions.json";
import { ApiError } from "@/lib/api";

const SINGLE_DRAFT = [
  {
    name: "async-await-then-chains",
    description: "Always use async/await instead of .then() chains",
    type: "convention" as const,
    body: "# async-await-then-chains\nAlways use async/await.",
    evidence_files: ["src/api/users.ts"],
  },
];

const THREE_DRAFTS = [
  { ...SINGLE_DRAFT[0]!, name: "rule-a" },
  { ...SINGLE_DRAFT[0]!, name: "rule-b" },
  { ...SINGLE_DRAFT[0]!, name: "rule-c" },
];

const draftMutate = vi.fn((_input: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
  opts?.onSuccess?.(SINGLE_DRAFT);
});
vi.mock("@/lib/hooks/conventions", () => ({
  useDraftSkills: () => ({ mutate: draftMutate, isPending: false }),
}));

const createMutateAsync = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createMutateAsync }),
  useSkills: () => ({ data: [], isFetching: false }),
}));

// LinkToAgentPanel (rendered once every draft is saved) owns its own hooks;
// stub them here too so this file doesn't need a real QueryClientProvider.
// An empty agents list keeps it in its "no agents yet" state, out of the way
// of these tests' own assertions.
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [], isLoading: false }),
  useAgentSkills: () => ({ data: [], isFetching: false }),
  useSetAgentSkills: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

afterEach(() => {
  cleanup();
  draftMutate.mockClear();
  createMutateAsync.mockReset();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("CreateSkillFromConventionsModal", () => {
  it("a single accepted candidate skips the grouping chooser and drafts immediately as a merge", () => {
    renderWithIntl(
      <CreateSkillFromConventionsModal repoId="r1" repoName="acme/payments-api" candidateIds={["c1"]} onClose={vi.fn()} />,
    );
    expect(draftMutate).toHaveBeenCalledWith(
      { candidate_ids: ["c1"], grouping: "merge" },
      expect.anything(),
    );
    expect(screen.queryByText("Group accepted conventions into")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("async-await-then-chains")).toBeInTheDocument();
  });

  it("more than one accepted candidate shows the grouping chooser, merge pre-selected", () => {
    renderWithIntl(
      <CreateSkillFromConventionsModal
        repoId="r1"
        repoName="acme/payments-api"
        candidateIds={["c1", "c2", "c3"]}
        onClose={vi.fn()}
      />,
    );
    expect(draftMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Group accepted conventions into")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(draftMutate).toHaveBeenCalledWith(
      { candidate_ids: ["c1", "c2", "c3"], grouping: "merge" },
      expect.anything(),
    );
  });

  it("saving a single draft calls create once with source 'extracted' and shows the saved hint", async () => {
    createMutateAsync.mockResolvedValueOnce({ id: "sk1", version: 1 });
    renderWithIntl(
      <CreateSkillFromConventionsModal repoId="r1" repoName="acme/payments-api" candidateIds={["c1"]} onClose={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "async-await-then-chains", source: "extracted" }),
      ),
    );
    expect(await screen.findByText("Saved as v1 · added to Skills Lab")).toBeInTheDocument();
  });

  it("saves multiple drafts sequentially; a 409 on one draft doesn't stop the rest", async () => {
    draftMutate.mockImplementationOnce((_input: unknown, opts?: { onSuccess?: (d: unknown) => void }) => {
      opts?.onSuccess?.(THREE_DRAFTS);
    });
    createMutateAsync
      .mockResolvedValueOnce({ id: "sk-a", version: 1 })
      .mockRejectedValueOnce(new ApiError('A skill named "rule-b" already exists', 409))
      .mockResolvedValueOnce({ id: "sk-c", version: 1 });

    renderWithIntl(
      <CreateSkillFromConventionsModal
        repoId="r1"
        repoName="acme/payments-api"
        candidateIds={["c1", "c2", "c3"]}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    fireEvent.click(screen.getByRole("button", { name: "Create 3 skills" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(3));
    expect(createMutateAsync).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: "rule-a" }));
    expect(createMutateAsync).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: "rule-b" }));
    expect(createMutateAsync).toHaveBeenNthCalledWith(3, expect.objectContaining({ name: "rule-c" }));
    await waitFor(() => expect(screen.getByText("2 of 3 skills created")).toBeInTheDocument());
  });

  it("disables Cancel/close while a draft is saving", async () => {
    let resolveCreate!: (v: { id: string; version: number }) => void;
    createMutateAsync.mockReturnValueOnce(new Promise((resolve) => (resolveCreate = resolve)));

    renderWithIntl(
      <CreateSkillFromConventionsModal repoId="r1" repoName="acme/payments-api" candidateIds={["c1"]} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());

    resolveCreate({ id: "sk1", version: 1 });
    await waitFor(() => expect(screen.getByText("Saved as v1 · added to Skills Lab")).toBeInTheDocument());
  });
});
