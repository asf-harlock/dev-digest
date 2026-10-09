/**
 * Keeps eval sessions inside their working directory. Evals run under bypassPermissions, so the
 * only thing that used to stop an agent that lost track of the repo root (e.g. one that took the
 * auto-memory dir for the project) from Glob/Grep-ing the whole home folder was macOS's own
 * privacy prompt for Desktop / Music / Photos. This module decides, per tool call, whether any
 * path the call touches leaves the allowed roots; run-claude.ts wires it in as a PreToolUse hook.
 */

import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Tools whose input names a path to read, search or write. */
const FILE_TOOLS = new Set(["Read", "Glob", "Grep", "Edit", "Write", "NotebookEdit", "LS"]);
const PATH_KEYS = ["file_path", "notebook_path", "path"] as const;

export interface GuardRoots {
  /** The session cwd; relative paths resolve against it. */
  root: string;
  home?: string;
  /** Extra directories file tools may touch (session transcript dir, temp dirs). */
  extra?: string[];
}

/** Claude Code's per-project transcript dir — oversized tool results are spilled there and re-Read. */
export function sessionDir(root: string, home = homedir()): string {
  return join(home, ".claude", "projects", root.replace(/[^A-Za-z0-9]/g, "-"));
}

export function defaultRoots(root: string): GuardRoots {
  const home = homedir();
  return { root, home, extra: [sessionDir(root, home), tmpdir(), "/tmp", "/private/tmp", "/private/var/folders"] };
}

function inside(p: string, dir: string): boolean {
  const rel = relative(dir, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function expand(p: string, roots: GuardRoots): string {
  const home = roots.home ?? homedir();
  const withHome = p.replace(/^\$\{?HOME\}?(?=\/|$)/, home).replace(/^~(?=\/|$)/, home);
  return resolve(roots.root, withHome);
}

/** Static prefix of a glob pattern: everything before the first segment holding a glob char. */
function globBase(pattern: string): string {
  const parts = pattern.split("/");
  const i = parts.findIndex((s) => /[*?[\]{}]/.test(s));
  return (i === -1 ? parts : parts.slice(0, i)).join("/") || (pattern.startsWith("/") ? "/" : ".");
}

/** Path-like tokens in a shell command: absolute, ~ / $HOME-relative, or climbing with "..". */
function shellPaths(command: string): string[] {
  const re = /(?:^|[\s'"=:(])((?:~|\$\{?HOME\}?|\.\.)(?=[\/\s'";|&)]|$)[^\s'";|&)]*|\/[^\s'";|&)]*)/g;
  return [...command.matchAll(re)].map((m) => m[1]!).filter((t) => !t.startsWith("//"));
}

/**
 * Paths in this tool call that fall outside the allowed roots ([] = allow).
 * File tools are allow-listed (root + extra). Bash cannot be parsed reliably, so it is only
 * deny-listed: a path that is the home dir, an ancestor of it ("/", "/Users"), or anywhere under
 * home outside the allowed roots. System paths such as /dev/null or /usr/bin stay usable.
 */
export function outsidePaths(toolName: string, input: unknown, roots: GuardRoots): string[] {
  const obj = (input ?? {}) as Record<string, unknown>;
  const allowed = [roots.root, ...(roots.extra ?? [])];
  const home = roots.home ?? homedir();

  if (FILE_TOOLS.has(toolName)) {
    const raw: string[] = [];
    for (const k of PATH_KEYS) if (typeof obj[k] === "string" && obj[k]) raw.push(obj[k] as string);
    if (toolName === "Glob" && typeof obj.pattern === "string") raw.push(globBase(obj.pattern));
    return raw.filter((p) => !allowed.some((dir) => inside(expand(p, roots), dir)));
  }

  if (toolName === "Bash" && typeof obj.command === "string") {
    return shellPaths(obj.command).filter((t) => {
      const p = expand(t, roots);
      if (allowed.some((dir) => inside(p, dir))) return false;
      return inside(home, p) || inside(p, home);
    });
  }

  return [];
}

export function denyReason(toolName: string, paths: string[], root: string): string {
  return (
    `${toolName} blocked: ${paths.join(", ")} is outside the repository. ` +
    `The repository root is ${root}${sep}; use paths inside it (relative paths resolve against it).`
  );
}
