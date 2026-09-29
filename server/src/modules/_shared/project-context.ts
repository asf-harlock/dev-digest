/**
 * Project Context (SPEC-04) — reading documents out of a repo clone, plus the
 * run-time resolver. In `_shared/` for the same reason as `context-paths.ts`:
 * the `context` module (listing / preview) and the review run executor both
 * need it and may not import each other.
 *
 * SECURITY: every read goes through `readContextFile`, which refuses a path
 * that is not a clean relative path, is not a regular file (symlinks are
 * refused, never followed), or whose real path leaves the clone (UI-2).
 */
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, sep } from 'node:path';
import type { GitClient, ProjectContextEntry } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';
import { detectInjectionPatterns } from './injection-detection.js';
import {
  MAX_CONTEXT_FILE_BYTES,
  MAX_CONTEXT_LISTING_FILES,
  PROJECT_CONTEXT_TOKEN_BUDGET,
  checkRelativeShape,
  dedupePaths,
  isExcludedDirName,
  isExcludedPath,
  MAX_READ_ATTEMPTS,
  kindForPath,
  matchesAnyGlob,
  projectContextLabel,
  sanitizePathForLog,
  type ContextRules,
} from './context-paths.js';

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export type ContextFileRead =
  | { status: 'ok'; text: string; size: number; mtimeMs: number }
  | { status: 'missing' }
  | { status: 'too_large'; size: number; mtimeMs: number }
  | { status: 'not_utf8'; size: number; mtimeMs: number }
  | { status: 'unreadable' };

function isNotFound(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

/** Read one document from the clone; see the module doc for what is refused. */
export async function readContextFile(
  clonePath: string,
  relPath: string,
  maxBytes: number = MAX_CONTEXT_FILE_BYTES,
): Promise<ContextFileRead> {
  if (!checkRelativeShape(relPath).ok) return { status: 'missing' };
  const full = join(clonePath, relPath);
  try {
    const st = await lstat(full);
    if (st.isSymbolicLink() || !st.isFile()) return { status: 'missing' };
    const [realRoot, realFull] = await Promise.all([realpath(clonePath), realpath(full)]);
    if (!realFull.startsWith(realRoot + sep)) return { status: 'missing' };
    if (st.size > maxBytes) return { status: 'too_large', size: st.size, mtimeMs: st.mtimeMs };
    const buf = await readFile(realFull);
    if (buf.length > maxBytes) return { status: 'too_large', size: buf.length, mtimeMs: st.mtimeMs };
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
      return { status: 'ok', text, size: buf.length, mtimeMs: st.mtimeMs };
    } catch {
      return { status: 'not_utf8', size: buf.length, mtimeMs: st.mtimeMs };
    }
  } catch (err) {
    return isNotFound(err) ? { status: 'missing' } : { status: 'unreadable' };
  }
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

export interface ScannedContextFile {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface ContextScan {
  /** First `MAX_CONTEXT_LISTING_FILES` matches, in path order. */
  files: ScannedContextFile[];
  /** Every match found, possibly more than `files.length`. */
  total: number;
}

async function walk(
  root: string,
  dir: string,
  rules: ContextRules,
  out: ScannedContextFile[],
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    return; // unreadable directory: skip it, list what we can
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks (UI-2)
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isExcludedDirName(entry.name, rules.excludes)) continue;
      await walk(root, full, rules, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = full.slice(root.length + 1).split(sep).join('/');
    if (isExcludedPath(rel, rules.excludes) || !matchesAnyGlob(rel, rules.globs)) continue;
    try {
      const st = await lstat(full);
      out.push({ path: rel, size: st.size, mtimeMs: st.mtimeMs });
    } catch {
      // vanished between readdir and lstat
    }
  }
}

/** True when the clone root exists and is a directory (EC-1: else "not cloned"). */
export async function cloneDirExists(clonePath: string): Promise<boolean> {
  try {
    return (await stat(clonePath)).isDirectory();
  } catch {
    return false;
  }
}

/** Walk the clone for documents matching the rules (500 max, in path order). */
export async function scanContextFiles(
  clonePath: string,
  rules: ContextRules,
  limit: number = MAX_CONTEXT_LISTING_FILES,
): Promise<ContextScan> {
  const all: ScannedContextFile[] = [];
  await walk(clonePath, clonePath, rules, all);
  all.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files: all.slice(0, limit), total: all.length };
}

// ---------------------------------------------------------------------------
// Prompt-shaped token count
// ---------------------------------------------------------------------------

/** Tokens of `text` as the prompt will carry it: inside its `<untrusted>` block. */
export function wrappedTokenCount(tokenizer: Tokenizer, path: string, text: string): number {
  return tokenizer.count(wrapUntrusted(projectContextLabel(path), text));
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export interface ResolveContextInput {
  git: Pick<GitClient, 'currentHead'>;
  tokenizer: Tokenizer;
  /** The repo the documents are read from (for `git.currentHead`). */
  repo: { owner: string; name: string };
  /** Absolute clone directory; null when the repo was never cloned. */
  clonePath: string | null;
  /** The agent's own attached paths, in saved order. */
  agentPaths: readonly string[];
  /** Enabled (link AND skill) skills in link order. */
  skills: readonly { name: string; body: string; contextPaths: readonly string[] }[];
  maxBytes?: number;
  budget?: number;
}

/** Something worth a run-log line; rendered by `formatContextNote`. */
export type ContextNote =
  | { kind: 'missing' | 'too_large' | 'unreadable' | 'over_budget'; path: string }
  | { kind: 'injection'; path: string; patterns: string[] }
  | { kind: 'skill_flagged'; skill: string }
  | { kind: 'head_moved'; path: string }
  | { kind: 'not_cloned' };

export interface ResolvedProjectContext {
  entries: ProjectContextEntry[];
  notes: ContextNote[];
}

interface ListedPath {
  path: string;
  origin: string;
}

/** Agent paths first, then each skill's, first occurrence wins (AC-22, EC-15). */
function buildList(input: ResolveContextInput, notes: ContextNote[]): ListedPath[] {
  const list: ListedPath[] = [];
  const seen = new Set<string>();
  const push = (paths: readonly string[], origin: string) => {
    for (const p of dedupePaths(paths)) {
      if (seen.has(p)) continue;
      seen.add(p);
      list.push({ path: p, origin });
    }
  };
  push(input.agentPaths, 'agent');
  for (const skill of input.skills) {
    // Live check: the flag is never stored, and a skill body edited straight in
    // the DB could still be enabled — its documents must not ride along (EC-15).
    if (detectInjectionPatterns(skill.body).detected) {
      notes.push({ kind: 'skill_flagged', skill: skill.name });
      continue;
    }
    push(skill.contextPaths, `skill:${skill.name}`);
  }
  return list;
}

/**
 * Resolve an agent's Project Context for one run: read each listed document
 * from the default-branch clone, record the commit it was read at, apply the
 * status rules and the token budget. Never throws for a bad document — each
 * one lands in `entries` with its own status. No LLM call is made (AC-26).
 */
export async function resolveProjectContext(
  input: ResolveContextInput,
): Promise<ResolvedProjectContext> {
  const notes: ContextNote[] = [];
  const list = buildList(input, notes);
  if (list.length === 0) return { entries: [], notes };

  const maxBytes = input.maxBytes ?? MAX_CONTEXT_FILE_BYTES;
  const budget = input.budget ?? PROJECT_CONTEXT_TOKEN_BUDGET;

  const failAll = (): ResolvedProjectContext => ({
    entries: list.map((l) => ({
      path: l.path,
      kind: kindForPath(l.path),
      origin: l.origin,
      sha: '',
      tokens: 0,
      status: 'unreadable' as const,
      text: '',
    })),
    notes: [...notes, ...list.map((l) => ({ kind: 'unreadable' as const, path: l.path }))],
  });

  if (!input.clonePath) {
    notes.push({ kind: 'not_cloned' });
    return failAll();
  }
  const clonePath = input.clonePath;

  // Read HEAD before and after the files; a resync in between (Rescan) could
  // otherwise hand back files from two commits under one sha (Q-4). One retry.
  let sha = '';
  let reads: ContextFileRead[] = [];
  let stable = false;
  try {
    for (let attempt = 0; attempt < MAX_READ_ATTEMPTS && !stable; attempt++) {
      const before = await input.git.currentHead(input.repo);
      reads = [];
      for (const l of list) reads.push(await readContextFile(clonePath, l.path, maxBytes));
      const after = await input.git.currentHead(input.repo);
      sha = after;
      stable = before === after;
    }
  } catch {
    return failAll();
  }

  const entries: ProjectContextEntry[] = [];
  let used = 0;
  let overBudget = false;
  list.forEach((l, i) => {
    const read = reads[i]!;
    const base = { path: l.path, kind: kindForPath(l.path), origin: l.origin, sha };
    switch (read.status) {
      case 'missing':
        notes.push({ kind: 'missing', path: l.path });
        entries.push({ ...base, tokens: 0, status: 'missing', text: '' });
        return;
      case 'too_large':
        notes.push({ kind: 'too_large', path: l.path });
        entries.push({ ...base, tokens: 0, status: 'too_large', text: '' });
        return;
      case 'not_utf8':
      case 'unreadable':
        notes.push({ kind: 'unreadable', path: l.path });
        entries.push({ ...base, tokens: 0, status: 'unreadable', text: '' });
        return;
      case 'ok':
        break;
    }
    if (!stable) {
      notes.push({ kind: 'head_moved', path: l.path });
      entries.push({ ...base, tokens: 0, status: 'unreadable', text: '' });
      return;
    }
    const tokens = wrappedTokenCount(input.tokenizer, l.path, read.text);
    if (overBudget || used + tokens > budget) {
      overBudget = true;
      notes.push({ kind: 'over_budget', path: l.path });
      entries.push({ ...base, tokens, status: 'over_budget', text: '' });
      return;
    }
    used += tokens;
    const injection = detectInjectionPatterns(read.text);
    if (injection.detected) {
      notes.push({ kind: 'injection', path: l.path, patterns: injection.patterns });
    }
    entries.push({ ...base, tokens, status: 'attached', text: read.text });
  });

  return { entries, notes };
}

/** Run-log line for a note. The path is sanitized here (UI-7). */
export function formatContextNote(note: ContextNote): string {
  switch (note.kind) {
    case 'missing':
      return `project context: ${sanitizePathForLog(note.path)} missing — skipped`;
    case 'too_large':
      return `project context: ${sanitizePathForLog(note.path)} skipped — larger than ${MAX_CONTEXT_FILE_BYTES / 1024} KB`;
    case 'unreadable':
      return `project context: ${sanitizePathForLog(note.path)} skipped — unreadable or not UTF-8`;
    case 'over_budget':
      return `project context: ${sanitizePathForLog(note.path)} skipped — over the ${PROJECT_CONTEXT_TOKEN_BUDGET}-token budget`;
    case 'injection':
      return `project context: ${sanitizePathForLog(note.path)} matches injection patterns (${note.patterns.join(', ')}) — attached as untrusted`;
    case 'skill_flagged':
      return `project context: skill "${sanitizePathForLog(note.skill)}" is injection-flagged — its documents were excluded`;
    case 'head_moved':
      return `project context: ${sanitizePathForLog(note.path)} skipped — the clone changed while it was being read`;
    case 'not_cloned':
      return 'project context: repository is not cloned — documents skipped';
  }
}

/** Attached entries only, in prompt order — what `reviewPullRequest` receives. */
export function attachedContext(entries: readonly ProjectContextEntry[]): { path: string; text: string }[] {
  return entries.filter((e) => e.status === 'attached').map((e) => ({ path: e.path, text: e.text }));
}
