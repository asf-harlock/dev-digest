import { describe, expect, it } from "vitest";
import { outsidePaths, sessionDir, type GuardRoots } from "./path-guard.js";

const home = "/Users/dev";
const root = "/Users/dev/Sites/repo";
const roots: GuardRoots = { root, home, extra: [sessionDir(root, home), "/tmp"] };
const check = (tool: string, input: unknown) => outsidePaths(tool, input, roots);

describe("path-guard file tools", () => {
  it("allows paths inside the root, absolute or relative", () => {
    expect(check("Read", { file_path: `${root}/server/CLAUDE.md` })).toEqual([]);
    expect(check("Read", { file_path: "server/CLAUDE.md" })).toEqual([]);
    expect(check("Grep", { pattern: "x", path: "server/src" })).toEqual([]);
    expect(check("Glob", { pattern: "**/*.ts" })).toEqual([]);
  });

  it("allows the session transcript dir and temp dirs", () => {
    expect(check("Read", { file_path: `${home}/.claude/projects/-Users-dev-Sites-repo/x/tool-results/a.txt` })).toEqual([]);
    expect(check("Read", { file_path: "/tmp/out.txt" })).toEqual([]);
  });

  it("denies the home folder and its protected subfolders", () => {
    expect(check("Glob", { pattern: "**/CLAUDE.md", path: home })).toEqual([home]);
    expect(check("Grep", { pattern: "x", path: "~" })).toEqual(["~"]);
    expect(check("Glob", { pattern: "/Users/dev/**/CLAUDE.md" })).toEqual(["/Users/dev"]);
    expect(check("Glob", { pattern: "~/Desktop/*" })).toEqual(["~/Desktop"]);
    expect(check("Read", { file_path: "../../Music/x" })).toEqual(["../../Music/x"]);
    expect(check("Glob", { pattern: "**/*", path: "/" })).toEqual(["/"]);
  });

  it("denies other projects' memory dirs taken for the repo", () => {
    expect(check("Read", { file_path: `${home}/.claude/projects/other/server/x.ts` })).toHaveLength(1);
  });
});

describe("path-guard Bash", () => {
  it("allows repo-relative commands and system paths", () => {
    expect(check("Bash", { command: "cd server && pnpm arch 2>/dev/null | head -40" })).toEqual([]);
    expect(check("Bash", { command: `grep -rn foo ${root}/server` })).toEqual([]);
    expect(check("Bash", { command: "/usr/bin/env node -v" })).toEqual([]);
    expect(check("Bash", { command: "curl https://example.com/a" })).toEqual([]);
  });

  it("denies scans of home, its ancestors and climbs out of the root", () => {
    expect(check("Bash", { command: "find ~ -name CLAUDE.md" })).toEqual(["~"]);
    expect(check("Bash", { command: "ls $HOME/Pictures" })).toEqual(["$HOME/Pictures"]);
    expect(check("Bash", { command: "rg foo /" })).toEqual(["/"]);
    expect(check("Bash", { command: "find /Users -name x" })).toEqual(["/Users"]);
    expect(check("Bash", { command: "ls ../../.." })).toEqual(["../../.."]);
  });
});
