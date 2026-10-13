/* ExportWizard.test.tsx — SPEC-11 Export to CI wizard (AC-1..AC-11, AC-14, AC-32, AC-35, EC-1..EC-3,
   EC-6, EC-9..EC-13, EC-35, NFR-13). The hooks are the seam and are controlled; this file asserts what
   the user sees and which request the wizard would send. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation, CiPreview, Repo } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import ciMessages from "../../../../../../messages/en/ci.json";

const REPOS = [
  { id: "r1", full_name: "acme/payments-api" },
  { id: "r2", full_name: "acme/web" },
] as Repo[];

const PREVIEW: CiPreview = {
  workflow_version: 1,
  file_count: 5,
  warnings: [],
  files: [
    { path: ".devdigest/agents/security-reviewer.yaml", kind: "manifest", editable: false, contents: "name: security", size_bytes: 14, note: null },
    { path: ".devdigest/memory.jsonl", kind: "memory", editable: false, contents: "", size_bytes: 0, note: null },
    { path: ".github/workflows/devdigest-review.yml", kind: "workflow", editable: true, contents: "name: DevDigest Review", size_bytes: 22, note: null },
    { path: ".devdigest/runner/index.js", kind: "runner", editable: false, contents: null, size_bytes: 900, note: null },
    { path: ".devdigest/runner/package.json", kind: "runner", editable: false, contents: null, size_bytes: 20, note: null },
  ],
};

const h = vi.hoisted(() => ({
  repos: [] as unknown[],
  installations: [] as unknown[],
  activeRepo: null as unknown,
  preview: {} as Record<string, unknown>,
  previewArgs: [] as unknown[][],
  fileArgs: [] as unknown[][],
  fileQuery: { data: undefined, isLoading: false, error: null } as Record<string, unknown>,
  exportCi: { mutate: vi.fn(), isPending: false },
  archive: { mutate: vi.fn(), isPending: false },
  save: vi.fn(),
}));

vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ activeRepo: h.activeRepo }) }));
vi.mock("@/lib/hooks/core", () => ({ useRepos: () => ({ data: h.repos, isLoading: false }) }));
vi.mock("@/lib/hooks/ci", () => ({
  useCiInstallations: () => ({ data: h.installations }),
  useCiPreview: (...args: unknown[]) => {
    h.previewArgs.push(args);
    return h.preview;
  },
  useCiPreviewFile: (...args: unknown[]) => {
    h.fileArgs.push(args);
    return h.fileQuery;
  },
  useExportCi: () => h.exportCi,
  useDownloadCiArchive: () => h.archive,
}));
vi.mock("./download-blob", () => ({ saveBlob: (...args: unknown[]) => h.save(...args) }));

import { ExportWizard, type ExportWizardProps } from "./ExportWizard";

const agent = { id: "ag1", name: "Security Reviewer" } as Agent;

beforeEach(() => {
  h.repos = REPOS;
  h.installations = [];
  h.activeRepo = REPOS[0];
  h.preview = { data: PREVIEW, isLoading: false, error: null, refetch: vi.fn() };
  h.previewArgs = [];
  h.fileArgs = [];
  h.fileQuery = { data: undefined, isLoading: false, error: null };
  h.exportCi = { mutate: vi.fn(), isPending: false };
  h.archive = { mutate: vi.fn(), isPending: false };
  h.save = vi.fn();
});
afterEach(cleanup);

function renderIt(props: Partial<ExportWizardProps> = {}) {
  const onClose = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
      <ExportWizard agent={agent} open onClose={onClose} {...props} />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

const next = () => fireEvent.click(screen.getByRole("button", { name: /^Continue/ }));
const toPreview = () => next();
const toConfigure = () => {
  next();
  next();
};
const toInstall = () => {
  next();
  next();
  next();
};
const editWorkflow = (text: string) =>
  fireEvent.change(screen.getByRole("textbox", { name: "Workflow file contents" }), { target: { value: text } });

describe("steps (AC-1, AC-2, AC-3, NFR-13)", () => {
  it("AC-1: opens on Target with the active repository preselected and marks the current step", () => {
    renderIt();
    const current = screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step");
    expect(current).toHaveTextContent("Target");
    expect(screen.getByRole("combobox")).toHaveValue("acme/payments-api");
  });

  it("AC-3: shows GitHub Actions as the only, recommended target", () => {
    renderIt();
    expect(screen.getByText("GitHub Actions")).toBeInTheDocument();
    expect(screen.getByText("recommended")).toBeInTheDocument();
    expect(screen.queryByText(/CircleCI|Jenkins|Generic CLI/)).not.toBeInTheDocument();
  });

  it("AC-2: ticks completed steps and moves aria-current as the user continues", () => {
    renderIt();
    toPreview();
    const items = screen.getAllByRole("listitem").filter((li) => li.closest("ol"));
    expect(items[0]).toHaveTextContent("(completed)");
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("renders nothing while closed", () => {
    renderIt({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("NFR-13: is a labelled dialog and announces the step through aria-live", () => {
    renderIt();
    expect(screen.getByRole("dialog", { name: "Export to CI" })).toBeInTheDocument();
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Step 1 of 4: Target")).toBe(true);
  });
});

describe("Target (AC-32, AC-35)", () => {
  it("AC-32: disables Continue and names the agent when another agent owns the repository", () => {
    h.installations = [{ repo: "Acme/Payments-API", agent_id: "other", agent_name: "Style Cop" }] as CiInstallation[];
    renderIt();
    expect(screen.getByRole("alert")).toHaveTextContent("Style Cop");
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeDisabled();
  });

  it("AC-34: lets the same agent continue on its own installation", () => {
    h.installations = [{ repo: "acme/payments-api", agent_id: "ag1", agent_name: "Security Reviewer" }] as CiInstallation[];
    renderIt();
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeEnabled();
  });

  it("AC-35: locks the repository and prefills triggers and post mode on Update", () => {
    renderIt({ initial: { repo: "acme/web", lockedRepo: true, triggers: ["reopened"], post_as: "none" } });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByTestId("locked-repo")).toHaveTextContent("acme/web");
    toConfigure();
    expect(screen.getByRole("button", { name: "pull_request:reopened" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "pull_request:opened" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("radio", { name: /None/ })).toBeChecked();
  });
});

describe("Preview (AC-4, AC-5, AC-6, EC-7, EC-16, EC-17)", () => {
  it("AC-4: lists every file and opens on the editable workflow", () => {
    renderIt();
    toPreview();
    for (const f of PREVIEW.files) expect(screen.getByRole("button", { name: new RegExp(f.path.replace(/[.]/g, "\\.")) })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Workflow file contents" })).toHaveValue("name: DevDigest Review");
    expect(screen.getByText("editable")).toBeInTheDocument();
  });

  it("AC-5: shows any other file read-only", () => {
    renderIt();
    toPreview();
    fireEvent.click(screen.getByRole("button", { name: /security-reviewer\.yaml/ }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("name: security")).toBeInTheDocument();
    expect(screen.getByText("read-only")).toBeInTheDocument();
  });

  it("EC-16: flags an empty memory file", () => {
    renderIt();
    toPreview();
    expect(screen.getByRole("button", { name: /memory\.jsonl/ })).toHaveTextContent("(empty)");
    fireEvent.click(screen.getByRole("button", { name: /memory\.jsonl/ }));
    expect(screen.getByText(/has no memory to export/)).toBeInTheDocument();
  });

  it("AC-6: loads a runner file only when it is selected", () => {
    renderIt();
    toPreview();
    expect(h.fileArgs.every((a) => a[3] === false)).toBe(true);
    h.fileArgs = [];
    h.fileQuery = { data: { path: ".devdigest/runner/index.js", contents: "console.log(1)", size_bytes: 14 }, isLoading: false, error: null };
    fireEvent.click(screen.getByRole("button", { name: /runner\/index\.js/ }));
    const last = h.fileArgs.at(-1)!;
    expect(last[2]).toBe(".devdigest/runner/index.js");
    expect(last[3]).toBe(true);
    expect(screen.getByText("console.log(1)")).toBeInTheDocument();
  });

  it("EC-7: shows warnings and still allows Continue", () => {
    h.preview = {
      data: { ...PREVIEW, warnings: [{ code: "provider_not_openrouter" }, { code: "memory_truncated", count: 500 }] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    renderIt();
    toPreview();
    expect(screen.getByText(/calls OpenRouter with this agent's model id/)).toBeInTheDocument();
    expect(screen.getByText("Only the 500 newest memory entries are exported.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeEnabled();
  });

  it("EC-3: shows runner_bundle_missing with the build command and blocks Continue", () => {
    h.preview = { data: undefined, isLoading: false, error: new ApiError("x", 409, "runner_bundle_missing"), refetch: vi.fn() };
    renderIt();
    toPreview();
    expect(screen.getByRole("alert")).toHaveTextContent("pnpm --dir agent-runner build");
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeDisabled();
  });

  it("only previews once the user has left Target", () => {
    renderIt();
    expect(h.previewArgs.at(-1)![2]).toBe(false);
    toPreview();
    expect(h.previewArgs.at(-1)![2]).toBe(true);
  });
});

describe("Configure (AC-7, AC-8, AC-9, EC-6)", () => {
  it("AC-7/AC-8: defaults to opened + synchronize on, reopened off, GitHub review selected", () => {
    renderIt();
    toConfigure();
    expect(screen.getByRole("button", { name: "pull_request:opened" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "pull_request:synchronize" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "pull_request:reopened" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("radio", { name: /GitHub review/ })).toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("AC-9: explains how to block merges without a GitHub App and has no Fail CI on control", () => {
    renderIt();
    toConfigure();
    expect(screen.getByText(/DevDigest Review \/ review/)).toBeInTheDocument();
    expect(screen.getByText(/No GitHub App needed/)).toBeInTheDocument();
  });

  it("EC-6: disables Continue when no trigger is on", () => {
    renderIt();
    toConfigure();
    fireEvent.click(screen.getByRole("button", { name: "pull_request:opened" }));
    fireEvent.click(screen.getByRole("button", { name: "pull_request:synchronize" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Select at least one trigger");
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeDisabled();
  });

  it("previews with the toggled triggers in canonical order", () => {
    renderIt();
    toConfigure();
    fireEvent.click(screen.getByRole("button", { name: "pull_request:reopened" }));
    const input = h.previewArgs.at(-1)![1] as { triggers: string[] };
    expect(input.triggers).toEqual(["opened", "synchronize", "reopened"]);
  });
});

describe("edited workflow (EC-12, EC-13)", () => {
  it("EC-12: asks before regenerating over an edit, and keeps the edit on cancel", () => {
    renderIt();
    toPreview();
    editWorkflow("name: mine");
    next();
    fireEvent.click(screen.getByRole("button", { name: "pull_request:reopened" }));
    const confirm = screen.getByRole("alertdialog");
    expect(confirm).toHaveTextContent("Regenerate the workflow?");
    expect(screen.getByRole("button", { name: "pull_request:reopened" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pull_request:reopened" })).toHaveAttribute("aria-pressed", "false");
  });

  it("EC-12: applies the change and discards the edit on confirm", () => {
    renderIt();
    toPreview();
    editWorkflow("name: mine");
    next();
    fireEvent.click(screen.getByRole("radio", { name: /PR comment/ }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Regenerate" }));
    expect(screen.getByRole("radio", { name: /PR comment/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /^Back/ }));
    expect(screen.getByRole("textbox", { name: "Workflow file contents" })).toHaveValue("name: DevDigest Review");
  });

  it("EC-12: changes without asking when the workflow was not edited", () => {
    renderIt();
    toConfigure();
    fireEvent.click(screen.getByRole("button", { name: "pull_request:reopened" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("EC-13: asks before closing with an edit (Esc) and closes on confirm", () => {
    const { onClose } = renderIt();
    toPreview();
    editWorkflow("name: mine");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Discard your edit?");
    fireEvent.click(screen.getByRole("button", { name: "Discard and close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("NFR-13: closes at once on Esc when nothing was edited", () => {
    const { onClose } = renderIt();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Install (AC-10, AC-11, AC-14, EC-35)", () => {
  it("AC-10: offers PR (default, recommended) and zip, naming the repo and the real file count", () => {
    renderIt();
    toInstall();
    expect(screen.getByRole("radio", { name: /Open a PR with these files/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Download as zip/ })).not.toBeChecked();
    expect(screen.getByText(/acme\/payments-api titled “Add DevDigest CI review” with the 5 generated files/)).toBeInTheDocument();
  });

  it("AC-11: reminds about OPENROUTER_API_KEY with a link to the repository's Actions secrets", () => {
    renderIt();
    toInstall();
    expect(screen.getByText("OPENROUTER_API_KEY")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Actions secrets of acme\/payments-api/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/settings/secrets/actions");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/GITHUB_TOKEN is provided by GitHub/)).toBeInTheDocument();
  });

  it("AC-20: sends the PR request without workflow_yaml when it was not edited", () => {
    renderIt();
    toInstall();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(h.exportCi.mutate).toHaveBeenCalledTimes(1);
    const body = h.exportCi.mutate.mock.calls[0]![0];
    expect(body).toEqual({
      repo: "acme/payments-api",
      target: "gha",
      post_as: "github_review",
      triggers: ["opened", "synchronize"],
      action: "open_pr",
    });
  });

  it("AC-20: sends the edited workflow text, and only that file", () => {
    renderIt();
    toPreview();
    editWorkflow("name: mine");
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(h.exportCi.mutate.mock.calls[0]![0]).toMatchObject({ workflow_yaml: "name: mine" });
  });

  it("AC-18: downloads the zip when that option is chosen and saves the file", () => {
    h.archive.mutate = vi.fn((_input, opts) => opts.onSuccess({ blob: new Blob(["z"]), filename: "devdigest-ci-payments-api.zip" }));
    renderIt();
    toInstall();
    fireEvent.click(screen.getByRole("radio", { name: /Download as zip/ }));
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(h.archive.mutate.mock.calls[0]![0]).toMatchObject({ action: "files" });
    expect(h.exportCi.mutate).not.toHaveBeenCalled();
    expect(h.save).toHaveBeenCalledWith(expect.any(Blob), "devdigest-ci-payments-api.zip");
    expect(screen.getByText(/devdigest-ci-payments-api\.zip has every file/)).toBeInTheDocument();
  });

  it("EC-35: keeps Install disabled and the options frozen while the request is pending", () => {
    renderIt();
    toInstall();
    h.exportCi.isPending = true;
    cleanup();
    renderIt();
    toInstall();
    expect(screen.getByRole("button", { name: "Installing…" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Open a PR/ })).toBeDisabled();
  });

  it("AC-14: shows View pull request once the PR is open", () => {
    h.exportCi.mutate = vi.fn((_input, opts) => opts.onSuccess({ pr_url: "https://github.com/acme/payments-api/pull/7", file_count: 5 }));
    renderIt();
    toInstall();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    const link = screen.getByRole("link", { name: /View pull request/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/pull/7");
    expect(link).toHaveAttribute("target", "_blank");
    // The kit's header X and the footer Close.
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
  });

  it("AC-14: renders no link for a pr_url that is not on github.com", () => {
    h.exportCi.mutate = vi.fn((_input, opts) => opts.onSuccess({ pr_url: "javascript:alert(1)", file_count: 5 }));
    renderIt();
    toInstall();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(screen.queryByRole("link", { name: /View pull request/ })).not.toBeInTheDocument();
  });
});

describe("Install errors by code (EC-1, EC-2, EC-9, EC-10, EC-11)", () => {
  const fail = (err: ApiError) => {
    h.exportCi.mutate = vi.fn((_input, opts) => opts.onError(err));
    renderIt();
    toInstall();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
  };

  it("EC-1: github_token_missing points to Settings → API Keys", () => {
    fail(new ApiError("m", 409, "github_token_missing"));
    expect(screen.getByRole("link", { name: /Settings → API Keys/ })).toHaveAttribute("href", "/settings/api-keys");
  });

  it("EC-2: github_permission names the token permissions", () => {
    fail(new ApiError("m", 403, "github_permission"));
    expect(screen.getByRole("alert")).toHaveTextContent(/Contents, Pull requests and Workflows/);
  });

  it("EC-9: ci_pr_failed offers Retry, which sends the request again", () => {
    fail(new ApiError("m", 502, "ci_pr_failed", { branch: "devdigest/ci" }));
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(h.exportCi.mutate).toHaveBeenCalledTimes(2);
  });

  it("EC-10: ci_no_changes says the repository already has the files", () => {
    fail(new ApiError("m", 409, "ci_no_changes"));
    expect(screen.getByRole("alert")).toHaveTextContent("The repository already contains these files.");
    expect(screen.queryByRole("button", { name: /Retry/ })).not.toBeInTheDocument();
  });

  it("EC-11: a 422 shows the parser message and stays on the Install step with the edit kept", () => {
    fail(new ApiError("bad indentation at line 3", 422, "validation_error"));
    expect(screen.getByRole("alert")).toHaveTextContent("bad indentation at line 3");
    expect(screen.getByRole("button", { name: "Install" })).toBeEnabled();
    expect(screen.getAllByRole("listitem").some((li) => li.getAttribute("aria-current") === "step" && li.textContent?.includes("Install"))).toBe(true);
  });

  it("branches on the code, not the message text", () => {
    fail(new ApiError("github_token_missing", 500, "something_else"));
    expect(screen.queryByRole("link", { name: /API Keys/ })).not.toBeInTheDocument();
  });
});

describe("buttons and clicks", () => {
  it("every wizard button is type=button (the kit's own X aside, which the portal keeps out of a form)", () => {
    const submitted = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <form onSubmit={submitted}>
          <ExportWizard agent={agent} open onClose={() => {}} />
        </form>
      </NextIntlClientProvider>,
    );
    toConfigure();
    for (const b of screen.getAllByRole("button")) {
      if (b.getAttribute("aria-label") === "Close") continue;
      expect(b).toHaveAttribute("type", "button");
    }
    expect(screen.getByRole("dialog").closest("form")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "pull_request:reopened" }));
    expect(submitted).not.toHaveBeenCalled();
    expect(h.exportCi.mutate).not.toHaveBeenCalled();
  });

  it("a click inside the dialog does not reach a clicked ancestor", () => {
    const parentClick = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>
        <div onClick={parentClick}>
          <ExportWizard agent={agent} open onClose={() => {}} />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe("added SPEC-11 coverage", () => {
  it("AC-2: the four steps are listed in the order Target, Preview, Configure, Install", () => {
    renderIt();
    const steps = within(screen.getByRole("list", { name: /steps/i })).getAllByRole("listitem");
    expect(steps.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Target"),
      expect.stringContaining("Preview"),
      expect.stringContaining("Configure"),
      expect.stringContaining("Install"),
    ]);
  });

  it("AC-3: the target card sits above the repository selector", () => {
    renderIt();
    const target = screen.getByText("GitHub Actions");
    const select = screen.getByRole("combobox");
    expect(target.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-44: without an initial repository the selector starts on the active repository, unlocked", () => {
    renderIt({ initial: { repo: "", lockedRepo: false } });
    expect(screen.getByRole("combobox")).toHaveValue("acme/payments-api");
    expect(screen.queryByTestId("locked-repo")).not.toBeInTheDocument();
    // The empty string is "unset": the shown repository is the real state, so the step can be left
    // and the preview is requested for it (with one connected repo no change event can ever fire).
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeEnabled();
    toPreview();
    expect((h.previewArgs.at(-1)![1] as { repo: string }).repo).toBe("acme/payments-api");
    expect(h.previewArgs.at(-1)![2]).toBe(true);
  });

  it("AC-44: with one connected repository and no active one, Add repository still leaves Target", () => {
    h.repos = [REPOS[1]];
    h.activeRepo = null;
    renderIt({ initial: { repo: "", lockedRepo: false } });
    expect(screen.getByRole("combobox")).toHaveValue("acme/web");
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeEnabled();
    toPreview();
    expect((h.previewArgs.at(-1)![1] as { repo: string }).repo).toBe("acme/web");
  });

  it("an Update with no triggers in `initial` starts from the defaults", () => {
    renderIt({ initial: { repo: "acme/web", lockedRepo: true, triggers: [] } });
    toConfigure();
    expect(screen.getByRole("button", { name: "pull_request:opened" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Continue/ })).toBeEnabled();
  });

  it("with no trigger selected, Back to Preview is disabled and no empty error shows", () => {
    renderIt();
    toConfigure();
    fireEvent.click(screen.getByRole("button", { name: "pull_request:opened" }));
    fireEvent.click(screen.getByRole("button", { name: "pull_request:synchronize" }));
    expect(screen.getByRole("button", { name: /^Back/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "pull_request:opened" }));
    expect(screen.getByRole("button", { name: /^Back/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /^Back/ }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("AC-33: ci_repo_taken from the server names the other agent and stays on Install", () => {
    h.exportCi.mutate = vi.fn((_input, opts) =>
      opts.onError(new ApiError("m", 409, "ci_repo_taken", { agent_name: "Style Cop" })),
    );
    renderIt();
    toInstall();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Style Cop");
    expect(screen.getByRole("button", { name: "Install" })).toBeEnabled();
  });

  it("EC-8: ci_export_running tells the user to wait", () => {
    h.exportCi.mutate = vi.fn((_input, opts) => opts.onError(new ApiError("m", 409, "ci_export_running")));
    renderIt();
    toInstall();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/already running/);
  });

  it("NFR-13: Tab wraps inside the dialog in both directions and focus returns to the opener on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    renderIt();
    const dialog = screen.getByRole("dialog");
    const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), select, a[href], textarea, input"));
    const first = items[0]!;
    const last = items[items.length - 1]!;
    expect(dialog).toHaveFocus();

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();

    cleanup();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("NFR-13: aria-pressed toggles follow clicks and the status region announces the step change", () => {
    renderIt();
    toConfigure();
    const reopened = screen.getByRole("button", { name: "pull_request:reopened" });
    fireEvent.click(reopened);
    expect(reopened).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("status").some((el) => el.textContent === "Step 3 of 4: Configure")).toBe(true);
  });

  it("NFR-15: the old 'Publish to CI' and 'Requires a GitHub App' strings are gone", () => {
    renderIt();
    toInstall();
    expect(screen.queryByText(/Publish to CI/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Requires a GitHub App/)).not.toBeInTheDocument();
    expect(JSON.stringify(ciMessages)).not.toMatch(/Publish to CI|Requires a GitHub App/);
  });
});
