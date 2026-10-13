## Hand-back 1

## Security review: SPEC-07 PR Context (diff vs 896f72b plus untracked files)

### Findings
| Severity | File:Line | Category | Input → sink | Exploit scenario | Suggestion | Confidence |
|---|---|---|---|---|---|---|
| none | | | | | | |

No exploitable defects found. Every Step 2 check that applied was traced input to sink.

### Checked, nothing found
- **Command and option injection (A05).** `runGit` in `server/src/adapters/git/simple-git.ts` uses `execFile('git', ['--literal-pathspecs', ...args])`, so no shell is involved.
  - `sha` must match `/^[0-9a-f]{40}$/` in `readFileAtCommit` and `ensureCommit`.
  - `prNumber` must be an integer of at least 1.
  - `path` is placed after `--` in `ls-tree`.
  - `path` must not start with `:` and must satisfy `posix.normalize(path) === path`.
  - The `cat-file blob` argument is the oid from the `ls-tree` parser, which only accepts 40 to 64 hex characters.
  - `ls-tree` only ever sees the validated sha, so a leading `-` cannot become an option.
- **`ls-tree -z` parser** (`server/src/adapters/git/ls-tree.ts`). It splits on NUL and accepts a record only when its path equals the requested path exactly. A crafted file name cannot forge a second record. The regex is linear.
- **Symlink, submodule and traversal.** Symlinks (mode 120000), submodules (160000) and non-blob entries are rejected. A symlinked parent directory returns no tree entry. Objects are read from the git object store, not the working tree. The default-branch preview goes through `readContextFile`, which was not changed: it does `lstat`, `realpath` and a shape check.
- **Path validator** (`server/src/modules/_shared/pr-context-paths.ts` and `context-paths.ts`). It rejects `:` prefixes, `..`, empty and `.` segments, backslashes, control characters, drive letters and absolute paths. It requires `.md` and the configured globs. The service validates on save and on preview. The resolver re-checks shape at run time, so stored paths are not trusted.
- **Leakage.** Git stderr and remote URLs are never captured. Every catch in `simple-git.ts` returns a fixed reason code. Run-log lines go through `sanitizePathForLog`, and injection warnings log only pattern names, never document text.
- **Tenancy (A01).** `GET`, `PUT` and preview all call `getContext()`. `PullsRepository.getPullWithRepo` scopes both the pull and the repo by `workspaceId`. `setContextPaths` scopes its update by `workspaceId` and PR id. `changedFiles(prId)` is keyed by a PR id already proven to be in the workspace. The preview returns 404 before it validates the path.
- **Input validation and mass assignment (A08).** The PUT body goes through the Zod `PrContextSaveBody`, and only `paths` is written. The preview query is `z.object({ path })`. The save cap and dedupe are enforced.
- **Prompt injection (LLM01).** PR docs are wrapped with `wrapUntrusted` as `pr-context:<path>` in the run, brief and intent prompts. `PR_CONTEXT_GUARD` is appended only when such blocks are present. `wrapUntrusted` neutralises closing and opening tags and escapes `"`, `<` and `>` in the label, so a path cannot break out of the attribute. Docs are read-only data that never become a path, URL or command. The brief and intent outputs are still Zod-parsed, and I did not review those parsers in this diff.
- **XSS.** `PrContextPreviewDrawer` renders `SafeMarkdown` (`skipHtml`, `urlTransform={safeUrl}`). The path is shown as a JSX text node. There is no `dangerouslySetInnerHTML`.
- **SSRF.** There is no new outbound `fetch`. The `git fetch origin` refspecs contain only the validated sha or the integer PR number.
- **Secrets.** No new `process.env` reads and no secret literals.

### Already enforced by hard-rules.sh
- none

### Not checked
- Dependency CVEs (`pnpm audit` was not run).
- Runtime git behaviour (I did not run git against a live clone).
- Redaction of run-prompt PR-context text. The brief's `wrapText` redacts secrets, but I did not confirm the run and intent paths do the same. That is a low-confidence hardening point, not a defect.
- `injection-detection.ts` internals and the unchanged `safeUrl` helper.

```findings-json
{"reviewer":"security","findings":[]}
```