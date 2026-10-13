## Hand-back 1

## Security review: SPEC-11 Export to CI (fe3a37a..working tree plus untracked files)

Scope: server/src/modules/ci/*, the octokit adapter diff, config, mocks, shared contracts, DB schema, and the client ExportWizard, CiTab and ci-runs pieces. I traced each of inputs (a)-(h) to its sink. No CRITICAL findings. One WARNING.

### Findings
| Severity | File:Line | Category | Input → sink | Exploit scenario | Suggestion | Confidence |
|---|---|---|---|---|---|---|
| WARNING | server/src/modules/ci/ingest.ts:150-155 (schema: server/src/vendor/shared/contracts/eval-ci.ts:599-603, 619; sink: server/src/modules/ci/service.ts:548 into `integer('pr_number')` at server/src/db/schema/ci.ts:64; abort path at service.ts:433-447 and 355-357) | A08 / A10 (forged artifact field, unbounded numeric) | Forged `pr_number` in `devdigest-result.json` and `devdigest-run.json` (`z.number().int()`, no upper bound) → `ci_runs.pr_number`, a 32-bit Postgres integer | A same-repo branch pusher edits the workflow in their PR and uploads an artifact with `pr_number: 99999999999` in both files. This passes the cross-check only when `run.pull_requests.length !== 1` (for example a head branch with two open PRs), because then `runPr` is null and the only comparison is result against meta (ingest.ts:150). The insert raises a Postgres out-of-range error, which is not an `AppError`. The worker rethrows it (service.ts:444), `Promise.all` rejects, and `refresh()` throws a 500. The poisoned run is never stored, so every later refresh re-hits it. Because the loop at service.ts:355 does not catch, one bad run also blocks refresh for every other installation in the workspace. This is a narrow, collaborator-only path. | Bound `pr_number` in `checkIngestArtifact` with `withinBound(a.pr_number, 2_147_483_647)` and require it to be at least 1 (UI-8 numeric bounds). Optionally wrap `ingestRun` in `refreshInstallation` so an unexpected error becomes a per-installation failure. | 0.65 |

### Checked, nothing found
- **(a) Client-edited `workflow_yaml` and paths:** The commit path is fixed to `WORKFLOW_PATH` (assemble.ts:86), and the YAML is checked for mapping type and 64 KiB (workflow.ts:158-168). It reaches only the user's own repo, with their own token. The CORS origin is limited to `webOrigin` (app.ts:100) and bodyLimit is 1 MiB, so a third-party web page cannot POST it. `readRunnerFile` honours a path only if it is in the directory listing (bundle.ts:77-81), so there is no traversal. Skill and manifest slugs are `[a-z0-9-]` only (helpers.ts:28).
- **(b) Ingest of CI artifacts:**
  - Zip bomb: compressed size is capped at 16 MiB (ingest.ts:70), only the two known entries are inflated, and `originalSize` is capped at 256 KiB. I read fflate 0.8.3 `unzipSync`: it inflates into a fixed `new u8(su)` buffer, so a forged declared size cannot make it allocate or write more than `su`.
  - Path traversal: unsafe entry names are flagged (ingest.ts:54-57) and entries are keyed by exact name, never written to disk.
  - Unexpected text: `agent` and other strings are validated and dropped (UI-9). Counts, cost and duration are bounded (ingest.ts:131-140).
  - Forged origin: `isExpectedWorkflowRun` requires the same repo (not a fork), the fixed workflow path and the `pull_request` event (helpers.ts:172-182). `commit_sha`, repository and PR number are cross-checked against the run. A same-repo writer can still forge numbers consistently, which is inherent and acknowledged in the spec.
  - Links: `html_url` is stored only if `isTrustedJobUrl` passes (https, exact origin github.com, no userinfo, path prefix `/<repo>/actions/runs/`; I confirmed `..` segments are normalised by `new URL` and rejected). Both the server (mappers.ts:67) and the client re-check it. Client `prUrl` is built from a regex-checked repo and an integer.
- **(c) Generated workflow:**
  - Values reach the workflow only through `env:` (workflow.ts:90-106). The sidecar script is a fixed printf over env vars, and no `github.event.*` text reaches a `run:` line.
  - The fork guard is present (workflow.ts:74), the trigger is `pull_request` (not `_target`), and permissions are `contents: read` plus `pull-requests: write` only when posting.
  - Actions are pinned by SHA, and checkout uses `persist-credentials: false`.
  - Agent name and system prompt go through the `yaml` serializer with a round-trip check (manifest.ts:44-67). They are never placed in a path or the workflow. `OPENROUTER_API_KEY` appears only as a secret name, never as a value.
  - Memory is JSON-escaped, one line per row, and shown in the preview.
- **(d) Tenancy:** Every query in ci/repository.ts is scoped by `workspaceId`. That covers repos, agents, skills (both the agents and skills tables), memory, installations, runs, the `agent_runs` insert, the `ci_runs` link update, `failStaleRunning` and `listRuns`. The upsert conflict target includes `workspace_id`. Every route calls `getContext` first. Filter values are parameterised.
- **(e) Secrets:** The token is read only via `container.secrets` (service.ts:652). It is never put in a response, commit or PR body, and `buildPrBody` contains no secrets. Error text from GitHub is scrubbed of the token, known token shapes and Bearer values, and truncated to 200 characters (errors.ts, helpers.ts:148). There is no new `process.env` secret read, and the only env read is `AGENT_RUNNER_DIST` in config.ts (a path, not a secret). There are no logs in modules/ci.
- **(f) `downloadArtifact`:** The redirect is handled manually, and the artifact URL is fetched with no Authorization header and `redirect: 'error'` (octokit.ts, `downloadArtifact`). It requires https and enforces a 16 MiB cap on both declared and streamed size. The Location header comes from the TLS api.github.com response and is not attacker-controlled, so no SSRF.
- **(g) Routes:** All 8 routes declare Zod `params`, `body` or `querystring`. Triggers are an enum, `agent_id` and `installation_id` are uuids, and `limit` is 1..200. There is no request-body spread into DB writes. Error `details` carry only ids or constants. Adapter errors use fixed text, and generic upstream messages are scrubbed and capped.
- **(h) Client rendering:** There is no `dangerouslySetInnerHTML`. All `<a href>` values are server-validated https github.com URLs or built from validated parts, with `rel="noopener noreferrer"`. The blob download uses an object URL.

### Not exploitable but worth knowing (not findings)
- Under `pull_request`, a same-repo writer can modify the runner or workflow in their PR and read `OPENROUTER_API_KEY`. This is GitHub's standard trust model for write-access collaborators, and the fork guard covers outside contributors.
- `downloadArtifact` checks only `https:` on the redirect, with no host allowlist. This is acceptable because the value comes from GitHub, not from PR data.

### Already enforced by hard-rules.sh
- none (I did not run the script; I saw no `sk-`/`ghp_`/PEM literals or `process.env` secret reads in the changed server code.)

### Not checked
- agent-runner internals (committed earlier, outside this diff).
- `pnpm audit`, so no CVE check on the new `yaml` dependency or on the fflate and octokit versions.
- Runtime behaviour of octokit's `redirect: 'manual'` (I read the code, I did not run it against GitHub).
- DB migration 0026 contents.
- client ErrorNotice and the i18n strings, beyond the link and HTML sinks.

```findings-json
{
  "reviewer": "security",
  "findings": [
    {
      "severity": "WARNING",
      "title": "Forged artifact pr_number unbounded: overflows int column, aborts refresh",
      "file": "server/src/modules/ci/ingest.ts",
      "start_line": 150,
      "end_line": 155,
      "rationale": "UI-8 requires numeric bounds on the forgeable artifact, but pr_number (CiRunMeta/CiResultArtifact z.number().int()) is only checked for result/meta equality, and against the run's PR only when GitHub reports exactly one PR. With zero or several PRs it is attacker-controlled (a same-repo PR author can forge the workflow). It is stored in ci_runs.pr_number (32-bit integer, service.ts:548). A value above 2^31-1 raises a non-AppError DB error that ingestRun rethrows (service.ts:444), so refresh returns 500, the run is never stored and re-fails on every refresh, and the loop at service.ts:355 skips all other installations. Category A08/A10.",
      "suggestion": "In checkIngestArtifact reject pr_number outside 1..2_147_483_647 (withinBound). Optionally catch unexpected errors per installation in refreshInstallation so one run cannot abort the workspace-wide refresh.",
      "confidence": 0.65
    }
  ]
}
```

---

## Hand-back 2

## Security re-review, round 2 (SPEC-11 Export to CI)

**S1 (forged pr_number): resolved.**
- `server/src/modules/ci/ingest.ts:48,62-64,157-162`: `validPrNumber` requires an integer from 1 to 2147483647. It runs on both `a.pr_number` and `m.pr_number` before the equality check, so a forged value can no longer overflow the `integer('pr_number')` column at `service.ts` (storing `runPr ?? artifact.pr_number`).
- `service.ts:381-387`: `refreshInstallation` now catches anything thrown from `runRefresh`. A non-`AppError` becomes `ingestFailed()` (`errors.ts:45-47`), which has fixed text and no upstream message or token, so one bad installation no longer aborts the workspace-wide loop.
- `service.ts:453`: the ingest worker applies the same mapping. The `refreshLocks` entry is still released in `finally`.

**New problems on lines this fix changed: none.**
- **`ciOctokit` split (`octokit.ts:155-170`, `downloadArtifact` at 570-615):** I found no weakening of the Authorization or redirect handling.
  - The artifact request goes through `ciOctokit` with `request: { redirect: 'manual' }`.
  - The `Location` header must be present, parse as a URL, and use `https:`.
  - The signed URL is fetched with a bare `fetch(url, { redirect: 'error' })`, so no Authorization header is sent and no redirect is followed.
  - The 16 MiB `readCapped` cap is intact.
  - Both clients hold the same token and only send it to the Octokit base URL. The default `octokit` client keeps library throttling. `ciOctokit` is used for pulls.create, git, pulls.list, the Actions calls and the artifact download.
- **`classifyGitHubError` details `{operation, status}`:** both values are a constant string and an HTTP status number. No upstream text or URL is added, and the message stays fixed.
- **404 handling (`service.ts:416-427`):** only a `github_permission` error carrying `details.status === 404` on a non-active installation is treated as "no runs yet". A 403, or a 404 on an active installation, goes to `refreshFailure`, and `touchLastRefreshed` is not reached, so the debounce clock does not advance on a permission failure.
- **`README.md`:** wording only, no security impact.

**Note, not a finding:** an `ingest_failed` still stops that installation's worker loop, and the same run is retried on the next refresh. With the pr_number overflow closed I could not identify another attacker-controlled field that triggers it, so this is a robustness point only.

```findings-json
{
  "reviewer": "security",
  "findings": []
}
```