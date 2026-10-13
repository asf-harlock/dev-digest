## Hand-back 1

Three WARNING findings and no CRITICAL. I read the changed files in full: service.ts, repository.ts, helpers.ts, ingest.ts, workflow.ts, assemble.ts, bundle.ts, manifest.ts, zip.ts, routes.ts, mappers.ts and the octokit diff. On the client I read hooks/ci.ts, ExportWizard, CiTab, RunHistory, CiRunsView and CiRunsTable. Nothing was edited or run.

| severity | file:line | defect | failing input |
|---|---|---|---|
| WARNING | client/src/app/agents/[id]/_components/ExportWizard/ExportWizard.tsx:77 and :89 | `useState(initial?.repo ?? null)` keeps `""` because `??` only skips null/undefined. `repo` therefore stays `""` and Continue is disabled (`!repo`). The `<select>` still shows the first connected repo, because React selects the first option when none matches `""`. Choosing the repo that is already displayed fires no `change` event, so with one connected repo there is no way to proceed. | CiTab "+ Add repository" opens the wizard with `initial = { repo: "", lockedRepo: false }`. The select shows `acme/payments-api`, state is `""`, Continue is disabled. The AC-44 test at ExportWizard.test.tsx:503 only checks the DOM value, so it passes. |
| WARNING | server/src/modules/ci/service.ts:416-418 (with adapter classification at octokit.ts `classifyGitHubError`) | The adapter maps both 403 and 404 to `github_permission`. `runRefresh` then treats that code as "no runs yet" for every installation that is not `active` and returns `refreshed`. A token without Actions read access is therefore never reported for `pending_pr` or `manual` installations (EC-25 not met). Those installations only become `active` by ingesting a run, so the failure is permanent and silent. | Fine-grained token without Actions:read, installation `pending_pr`, PR merged, workflow running. `POST /ci/refresh` returns `status:'refreshed', added:0, failure:null` and `last_refreshed_at` advances. The installation stays `pending_pr` with no run ingested and no error shown. |
| WARNING | client/src/app/agents/[id]/_components/ExportWizard/ExportWizard.tsx:94 and :193-200 (render at PreviewStep.tsx:63-65) | The preview query is disabled when `triggers.length === 0`, but Back from Configure is not blocked. Preview then has `data` undefined, `isLoading` false and `error` null, so it falls into `<ErrorNotice error={null}>`. That shows a "generic" error alert with an empty message and a Retry button. Retry calls `refetch()` on the disabled query and gets a 422 from `min(1)`. | In Configure, untoggle every trigger, then click Back. Preview shows a spurious error alert instead of an empty or guidance state. |

Smaller issues I judged below the reporting bar:
- `runRefresh`'s worker loop checks the deadline before checking whether the queue is empty. A refresh that finishes its last run right at the deadline is reported as `refresh_timeout` and does not advance `last_refreshed_at`.
- `commitFiles` computes `changed` by comparing the branch tree with the base tree. If the install PR was merge-committed, `devdigest/ci` still exists, and the base has since moved on, an unchanged re-export is likely to end in `ci_pr_failed` instead of `ci_no_changes`. I could not confirm how GitHub answers the PR creation.

findings-json block:

```findings-json
{
  "reviewer": "bug",
  "findings": [
    {
      "severity": "WARNING",
      "title": "Add repository leaves repo as empty string; Continue stuck disabled",
      "file": "client/src/app/agents/[id]/_components/ExportWizard/ExportWizard.tsx",
      "start_line": 77,
      "end_line": 89,
      "rationale": "`useState(initial?.repo ?? null)` keeps '' (?? does not skip empty strings), so `repo = repoChoice ?? activeRepo...` stays '' and Continue is disabled (`!repo`). The controlled <select value=''> has no matching option, so React displays the first option; re-selecting the displayed option fires no change event. With one connected repo the step cannot be left. The AC-44 test only asserts the DOM select value, so it passes.",
      "suggestion": "Initialise with `initial?.repo || null` (treat '' as unset) so the active or first repo is the real state, or add an empty placeholder option when no repo is chosen.",
      "confidence": 0.8
    },
    {
      "severity": "WARNING",
      "title": "403 permission failure swallowed as 'no runs yet' for non-active installs",
      "file": "server/src/modules/ci/service.ts",
      "start_line": 413,
      "end_line": 421,
      "rationale": "classifyGitHubError maps both 403 and 404 to github_permission, and runRefresh converts that code into `runs = []` whenever the installation is not 'active'. A token lacking Actions read access yields status 'refreshed' with failure null and advances last_refreshed_at for pending_pr/manual installations, violating EC-25. Those installations only turn active by ingesting a run, so the problem is never surfaced.",
      "suggestion": "Distinguish 404 (workflow file not merged yet) from 403 in the adapter error (for example details.status) and swallow only the 404 case; keep 403 as a failure for every installation status.",
      "confidence": 0.65
    },
    {
      "severity": "WARNING",
      "title": "Back to Preview with zero triggers shows a bogus generic error",
      "file": "client/src/app/agents/[id]/_components/ExportWizard/ExportWizard.tsx",
      "start_line": 94,
      "end_line": 94,
      "rationale": "useCiPreview is disabled when triggers.length === 0, but Back from Configure is allowed. PreviewStep then has data undefined, isLoading false and error null, so it renders ErrorNotice with error=null (kind 'generic', empty message) plus a Retry whose refetch hits the server with triggers [] and gets a 422.",
      "suggestion": "Disable Back to Preview while triggers are empty, or render an explicit 'select at least one trigger' state in PreviewStep when the query is disabled and has no data.",
      "confidence": 0.6
    }
  ]
}
```

---

## Hand-back 2

Round 2: B1, B2 and B3 are all resolved. I found no new defects in the lines changed this round. Read-only review, nothing was run.

| id | status | evidence |
|---|---|---|
| B1 | resolved | `ExportWizard.tsx:77-79`. `initial?.repo \|\| null` means `""` falls through to `activeRepo?.full_name ?? repoList[0]?.full_name` at :89. `repo` is then a real value, Continue is enabled, and the preview is requested for that repo. Triggers fall back to `DEFAULT_TRIGGERS` when `initial.triggers` is empty (`?.length` check). `post_as` uses `\|\|`. |
| B2 | resolved | `octokit.ts:100` puts `{ operation, status }` in the `github_permission` details. `errors.ts` `isGithubNotFound` reads `details.status === 404`. `service.ts:416-427` swallows the error as "0 runs" only when the code is `github_permission`, the status is 404 and the installation is not `active`. A 403 now returns `refreshFailure`, so `touchLastRefreshed` is not reached and the debounce clock does not advance. |
| B3 | resolved | `ExportWizard.tsx:208`. Back is `disabled={pending \|\| (step === STEP_CONFIGURE && triggers.length === 0)}`. Preview with no triggers is no longer reachable. The step indicator only shows labels, so there is no other way back. |

Checks on the other lines changed this round:
- **`refreshInstallation`** (`service.ts:380-392`): `finally` always deletes the lock. Any non-AppError from `runRefresh` (for example a DB failure in `failStaleRunning`) is caught and returned as `refreshFailure(..., ingestFailed())`, so it is never reported as `refreshed`.
- **Ingest worker** (`service.ts:~449`): non-AppErrors set `fatal` to `ingestFailed()`. `fatal` is checked before the `timedOut` check and before `failStaleRunning`, `markActiveOnFirstRun` and `touchLastRefreshed`. The result is `failed` with the tally so far, and `last_refreshed_at` is not advanced.
- **`ingest_failed` code**: the response schema's `failure.code` is `z.string()`. A single-installation refresh throws a 500 with that code. The client maps unknown codes to the generic reason.
- **`validPrNumber`** (`ingest.ts:62-64`, :157-165): it requires an integer from 1 to 2147483647, which fits the integer column. It is checked on both the artifact and the sidecar metadata. The number-mismatch and run-PR checks are unchanged and run after it.
- **`ciOctokit` split** (`octokit.ts`): every CI method uses `ciOctokit`: `openPullRequest` (`pulls.create`), `commitFiles` (`git.*`), `findOpenPr` (`pulls.list`), `listWorkflowRuns`, `listRunArtifacts` and `downloadArtifact` (`request`). `openPullRequest` and `findOpenPr` are only called from `modules/ci/service.ts`. The default `octokit` keeps `pulls.list`, `get`, `listFiles`, `listCommits`, `createReview`, `listReviewComments`, the reply/comment calls, `issues.get` and `users.getAuthenticated`. `octokit-throttle.test.ts` confirms the default client gets no throttle option.
- **`lib/ci-format.ts`**: `RunHistory` passes the installation's `repo` into `isTrustedJobUrl`. A same-repo `/actions/runs/` URL still renders a link, because the comparison is case-insensitive and the server stores `job_url` only after the same check against the same repo. The repo prop is always a string here (`RunHistory` passes `installation.repo`), so there is no null-repo path. An empty repo would fail closed and render no link. `CiRunsTable` passes `run.repo`.

```findings-json
{
  "reviewer": "bug",
  "findings": []
}
```