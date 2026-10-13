## Hand-back 1

## Security review: `git diff 567ed70` (SPEC-05 onboarding tour, L05-lab @ 81581d8)

### Findings
| Severity | File:Line | Category | Input → sink | Exploit scenario | Suggestion | Confidence |
|---|---|---|---|---|---|---|
| none | - | - | - | - | - | - |

No exploitable defect at or above the 0.6 confidence threshold.

### Checked, nothing found
- **Tenancy (A01).**
  - Every query in `server/src/modules/onboarding-tour/repository.ts` is scoped by workspace. `getRepo` filters on `repos.workspaceId`. `getStored` joins `onboarding` to `repos` and filters on `repos.workspaceId`. `settings` is filtered on `settings.workspaceId`.
  - `getRanks` reads `file_rank` by `repoId` only, but it first calls `getRepo(workspaceId, repoId)` and returns an empty map if that fails.
  - `upsert` also calls `getRepo` first. `routes.ts` takes `workspaceId` from `getContext()`, and `:repoId` is validated as a UUID.
  - `service.ts` calls `requireRepo` before any read or write.
- **Secrets and logs (A04/A09).**
  - `service.ts:159` and `:226` log only `repoId`, provider, model, token count, outcome and a message string. `service.ts:225` states that no prompt text or raw provider message is logged.
  - The facts prompt carries env-var names only. `parseEnvKeys` drops values, and `parseScriptNames` drops script bodies.
  - `buildFactsPrompt` runs `redactSecrets` on every line.
  - The diff adds no `process.env` read and no secret literal.
- **Command injection (A05).**
  - `historyCounts` in `simple-git.ts` (added at about line 133) uses `g.raw([...])` argv arrays, not a shell string.
  - `sinceDays` must be an integer in 1..3650 before it is interpolated into `--shallow-since=N.days.ago` and `--since=N.days.ago`. No PR data reaches argv, and the repo path comes from `clonePathFor`.
  - The 60 s abort signal covers both the fetch and the log.
  - Compose commands that use `m.path` and `cd <dir> &&` commands both pass through `SAFE_DIR_RE` (`/^[A-Za-z0-9_@./-]+$/`). `commandsFromManifest` returns no commands when the directory is unsafe. The dir comes from `readdir` entries, so `..` and spaces cannot occur.
  - A directory name starting with `-` is allowed, for example `cd -x && …`. The effect is a failed or odd command, not execution, so I rated it below 0.6 and did not report it.
- **Clone file reads.** `clone-files.ts` reads only through `readContextFile`, which has these controls:
  - `checkRelativeShape` rejects non-relative paths.
  - `lstat` refuses symlinks and non-files.
  - A `realpath` prefix check keeps the read inside the clone.
  - A size cap of `MAX_MANIFEST_BYTES` (64 KiB) applies.
  - Decoding is UTF-8 only.
  - Paths come from a fixed `MANIFEST_NAMES` list joined to `readdir` names, and the package-directory count is capped at 30.
- **Prompt injection (LLM01).**
  - `wrapUntrusted('repository-facts', …)` neutralises `</untrusted` variants and forged `<untrusted` openings.
  - `onboarding.system.md` declares the wrapped content to be data.
  - Model output is parsed through the `RawTour` Zod schema with length caps.
  - `mergeGrounded` keeps a path only if it is a fact file or an indexed directory.
  - Run commands come only from the skeleton, and the model can supply only a description matched by exact string.
  - Diagram node ids must match `NODE_ID_RE` and be unique, and both edge ends must exist.
  - Free text is run through `redactSecrets`.
  - Nothing the model returns is used as a file path, URL or command.
- **XSS (A05).**
  - I found no `dangerouslySetInnerHTML` in the tour components.
  - `Markdown` (`vendor/ui/primitives/Markdown.tsx`) uses `react-markdown` with `remark-gfm` and no `rehype-raw`, so raw HTML is not rendered. The default URL transform should block `javascript:` hrefs.
  - The mermaid source is built with synthetic ids `n0..n(N-1)` and labels escaped by `escapeLabel`. `MermaidDiagram` calls `initialize` with `securityLevel: "strict"`. The `innerHTML = svg` at `MermaidDiagram.tsx:47` takes output that strict mode has already sanitised.
  - `githubBlobUrl` encodes the path with `encodeURIComponent` per segment, and the host is fixed to `https://github.com`. The Open link in `CriticalPathsSection.tsx:40-42` uses `target="_blank"` with `rel="noopener noreferrer"`.
  - `repoFullName` and `sha` come from server-side repo and index data, not from the model.
- **Input validation (A08).** Both new routes validate params and body with Zod, and the body is not spread into a DB write. `window_days` is range-checked.
- **SSRF (A01/A10).** The diff adds no outbound `fetch`. The git `fetch` targets the existing clone's `origin`.

Low-confidence notes, below the reporting threshold and not findings:
- `historyCounts` accumulates into a plain `{}` keyed by repo file paths. A file named `constructor` or `toString` would give a garbage count. That only zeroes hotness and has no security effect.
- The Markdown `a` renderer emits model-supplied links without `rel`. `href` goes through react-markdown's default sanitiser, and the `body` is model-authored prose, so the only residual risk is an off-site link in a description.

### Already enforced by hard-rules.sh
- none. I did not run the script and found no `sk-…`, `ghp_…` or `process.env` hits by reading the diff.

### Not checked
- I did not run the script or execute any code. I did not run `pnpm audit`.
- I did not confirm the installed `react-markdown` version. I relied on its default URL sanitisation.
- I did not review the `*.it.test.ts` suites, the e2e flow, or the client hooks and polling beyond a grep for sinks.
- I did not check how the `origin` remote URL and any credentials are configured in the clone adapter. That code is pre-existing.

```findings-json
{
  "reviewer": "security",
  "findings": []
}
```