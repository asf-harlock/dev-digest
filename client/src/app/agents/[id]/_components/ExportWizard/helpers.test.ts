import { describe, it, expect } from "vitest";
import type { CiInstallation, CiPreviewFile } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import {
  buildInput,
  defaultFilePath,
  exportErrorKind,
  findTakenBy,
  isGithubUrl,
  secretsUrl,
  takenAgentName,
  toggleTrigger,
} from "./helpers";

describe("toggleTrigger", () => {
  it("adds in canonical order and removes", () => {
    expect(toggleTrigger(["synchronize"], "opened")).toEqual(["opened", "synchronize"]);
    expect(toggleTrigger(["opened", "synchronize"], "opened")).toEqual(["synchronize"]);
    expect(toggleTrigger(["opened"], "opened")).toEqual([]);
  });
});

describe("buildInput", () => {
  it("omits action and workflow_yaml unless given", () => {
    expect(buildInput({ repo: "a/b", triggers: ["opened"], postAs: "none" })).toEqual({
      repo: "a/b",
      target: "gha",
      post_as: "none",
      triggers: ["opened"],
    });
    expect(buildInput({ repo: "a/b", triggers: ["opened"], postAs: "none", action: "files", workflowYaml: "x" })).toMatchObject({
      action: "files",
      workflow_yaml: "x",
    });
  });
});

describe("findTakenBy", () => {
  const inst = [{ repo: "Acme/Web", agent_id: "a1", agent_name: "One" }] as CiInstallation[];
  it("matches case-insensitively and ignores the agent's own installation", () => {
    expect(findTakenBy(inst, "acme/web", "a2")?.agent_name).toBe("One");
    expect(findTakenBy(inst, "acme/web", "a1")).toBeUndefined();
    expect(findTakenBy(undefined, "acme/web", "a2")).toBeUndefined();
  });
});

describe("urls", () => {
  it("accepts only github.com links", () => {
    expect(isGithubUrl("https://github.com/a/b/pull/1")).toBe(true);
    expect(isGithubUrl("https://evil.example/x")).toBe(false);
    expect(isGithubUrl("javascript:alert(1)")).toBe(false);
    expect(isGithubUrl(null)).toBe(false);
  });
  it("builds the secrets URL only for a plain owner/name", () => {
    expect(secretsUrl("acme/payments-api")).toBe("https://github.com/acme/payments-api/settings/secrets/actions");
    expect(secretsUrl("acme/../x?y")).toBeNull();
    expect(secretsUrl("")).toBeNull();
  });
});

describe("defaultFilePath", () => {
  it("prefers the workflow, else the first file", () => {
    const f = (path: string, kind: CiPreviewFile["kind"]) => ({ path, kind }) as CiPreviewFile;
    expect(defaultFilePath([f("a", "manifest"), f("w", "workflow")])).toBe("w");
    expect(defaultFilePath([f("a", "manifest")])).toBe("a");
    expect(defaultFilePath([])).toBeNull();
  });
});

describe("exportErrorKind", () => {
  it("uses the code, then 422, never the message", () => {
    expect(exportErrorKind(new ApiError("x", 409, "ci_no_changes"))).toBe("ci_no_changes");
    expect(exportErrorKind(new ApiError("x", 422, "validation_error"))).toBe("invalid_workflow");
    expect(exportErrorKind(new ApiError("ci_no_changes", 500, "other"))).toBe("generic");
    expect(exportErrorKind(new Error("boom"))).toBe("generic");
  });
  it("reads the agent name of a ci_repo_taken error", () => {
    expect(takenAgentName(new ApiError("x", 409, "ci_repo_taken", { agent_name: "Style Cop" }))).toBe("Style Cop");
    expect(takenAgentName(new ApiError("x", 409, "ci_repo_taken"))).toBeNull();
  });
});
