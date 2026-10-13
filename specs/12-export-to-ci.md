# Spec: Export to CI
Spec ID: SPEC-12
Status: approved
Supersedes: —

## Проблема й користувач

A developer who has tuned a review agent in the studio can only run it by hand on a PR that is already synced locally. To get the same review on every pull request of a team repository, they would have to write a GitHub Actions workflow, hand-copy the agent's prompt and skills into the repo, and then have no view of what the automated runs found or cost.

The pieces exist but are not connected. `agent-runner/` (commit `fe3a37a`) is a standalone CLI that runs the same `reviewer-core` pipeline inside a target repo's own Actions job and writes `devdigest-result.json`. The contracts `CiExportInput`, `CiInstallation`, `CiRun`, `CiResultArtifact` and the tables `ci_installations`, `ci_runs` and `agent_runs.source='ci'` are in place. What is missing is the server module that generates and installs the files, the ingest of results, and the screens: the Export to CI wizard, the CI tab on the agent, and the CI Runs page. There is no `server/src/modules/ci/` today.

The studio is local-first (API on `localhost:3001`, no auth), so GitHub Actions cannot call back into it. Results therefore have to be pulled from GitHub with the stored token, and everything that comes back from a repo's CI is treated as untrusted input.

## Goals / Non-goals

**Goals**
- A four-step Export to CI wizard (Target → Preview → Configure → Install) that opens a pull request from branch `devdigest/ci`, or downloads the same files as a zip, and never writes to the default branch.
- A generated, safe-by-construction GitHub Actions workflow that runs the bundled `agent-runner` unchanged.
- One agent per repository, enforced on server and client.
- An agent CI tab showing installations, workflow version, run history and the Fail CI on setting, with Update CI config.
- A CI Runs page listing repository, PR, agent, verdict, findings, cost, duration and a link to the job.
- Pull-based ingest of workflow runs and their result artifact into `ci_runs` and `agent_runs` (`source='ci'`, `pr_id` NULL), validated and isolated from PR views.

**Non-goals**
- Changing `agent-runner/` in any way (no new artifact fields, no `--agent` argument, no memory reading, no `post_as` in the manifest). The user did not grant edits there. Verdict and run link are derived server-side.
- More than one agent per repository. Considered and rejected: choosing the agent by env or argument (needs a runner change) and a loop over several manifests (changes exit-code and artifact semantics).
- CircleCI, Jenkins and Generic CLI targets. No generators exist; they are not shown and the server answers `422` for any target other than `gha`.
- A push endpoint that GitHub Actions would call. Considered and rejected because the API is on `localhost` without auth, and an inbound endpoint would need its own token and a public URL. A hybrid of push and pull is rejected for the same reason plus two code paths.
- Publishing `devdigest/review-action@v1` or using it. It stays a comment in the workflow header until such an action exists. Considered and rejected: downloading the runner inside the job from a hosted URL (no host, supply-chain risk).
- Proving that the content of a result artifact is genuine. A PR author in the same repo can alter the workflow and forge the artifact; only origin (workflow path, head SHA, repository, event) is checked. Artifact attestations are out of scope.
- Setting the `OPENROUTER_API_KEY` repository secret, creating the required status check or branch protection, or any GitHub App.
- Findings, trace or drill-down pages for a CI run: a CI run has no `reviews`, `findings` or `run_traces` rows.
- The Stats tab shown in the design, the multi-run service, the PR feed and the Memory, Multi-Agent Review and Agent Performance sidebar items.
- Detecting that the install PR was merged or closed. The installation becomes `active` when its first run is ingested.
- Backfilling more than the 30 newest workflow runs of an installation.
- Storing CI runs only in `ci_runs` without an `agent_runs` row. Considered and rejected because the request requires `agent_runs` with `source='ci'`.

## User stories

- **US-1** As a developer, I want to export a finished review agent to a GitHub repository through a four-step wizard that opens a pull request, so that CI runs the agent on every PR without me writing a workflow and without anything reaching the default branch unreviewed.
- **US-2** As a developer who cannot or does not want to let the studio write to the repo, I want to download the same files as a zip, so that I can add them to the repository myself.
- **US-3** As a developer, I want the agent's CI tab to show where it is deployed, which workflow version each repo has, the run history and the Fail CI on policy, so that I can manage and update the deployment in one place.
- **US-4** As a developer, I want a CI Runs screen with the repository, PR, agent, verdict, findings, cost, duration and a link to the job for every automated review, so that I can see what the agents did in CI.
- **US-5** As a developer running DevDigest locally, I want CI results pulled from GitHub on demand with the stored token, so that nothing has to reach my machine from the internet.
- **US-6** As a developer, I want ingested CI data validated and kept apart from local PR views, so that a malformed or forged artifact cannot corrupt local runs, PR lists or costs.

## Acceptance criteria (EARS)

### Wizard

- **AC-1** (US-1) КОЛИ the user clicks **Add to CI** on the agent's CI tab, the system (shall) open the Export to CI dialog on its Target step with the active repository preselected.
- **AC-2** (US-1) The system (shall) show the dialog's four steps Target, Preview, Configure and Install in that order, with the current step marked and completed steps ticked.
- **AC-3** (US-1) The system (shall) show on the Target step GitHub Actions as the only target, labelled recommended, above a selector of the connected repositories.
- **AC-4** (US-1) КОЛИ the user continues from the Target step, the system (shall) show the Preview step listing every file to create: the agent manifest, one file per exported skill, `.devdigest/memory.jsonl`, `.github/workflows/devdigest-review.yml` and the runner files.
- **AC-5** (US-1) КОЛИ the user selects a file in Preview, the system (shall) show its full contents, in an editable text area for the workflow file only and as read-only text for every other file.
- **AC-6** (US-1) КОЛИ the user selects a runner file in Preview, the system (shall) load its contents from the server at that moment instead of with the file list.
- **AC-7** (US-1) The system (shall) show on the Configure step the triggers `pull_request:opened`, `pull_request:synchronize` and `pull_request:reopened` as toggles, with `opened` and `synchronize` on and `reopened` off by default.
- **AC-8** (US-1) The system (shall) show on the Configure step the radio options GitHub review (selected by default, labelled recommended), PR comment and None (exit code only) for how the result is posted.
- **AC-9** (US-1) The system (shall) show on the Configure step an info box saying that blocking merges needs Fail CI on set to a value other than Never plus a required status check named `DevDigest Review / review` in the repository's branch protection, and that no GitHub App is needed.
- **AC-10** (US-1, US-2) The system (shall) show on the Install step the options Open a PR with these files (selected by default, labelled recommended) and Download as zip, with the PR option naming the target repository and the total number of files.
- **AC-11** (US-1) The system (shall) tell the user on the Install step to add the repository secret `OPENROUTER_API_KEY`, link to that repository's Actions secrets page, and state that `GITHUB_TOKEN` is provided by GitHub.
- **AC-12** (US-1) КОЛИ the user clicks **Install** with Open a PR selected, the system (shall) commit all files in one commit to the branch `devdigest/ci`, creating that branch from the repository's default branch when it does not exist.
- **AC-13** (US-1) КОЛИ the commit has succeeded, the system (shall) open a pull request titled "Add DevDigest CI review" from `devdigest/ci` against the repository's default branch.
- **AC-14** (US-1) КОЛИ the pull request has been opened, the system (shall) show a "View pull request" link to it in the dialog.
- **AC-15** (US-1) КОЛИ the pull request has been opened, the system (shall) store the installation with status `pending_pr`, the pull request URL, the workflow version, the agent version, the target, the post mode, the triggers and the agent's `ci_fail_on` as exported.
- **AC-16** (US-1) КОЛИ an open pull request with head `devdigest/ci` already exists in the repository, the system (shall) add the new commit to that branch and return that pull request's URL instead of opening a second one.
- **AC-17** (US-1) The system (shall) never write to a repository's default branch directly.
- **AC-18** (US-2) КОЛИ the user clicks **Install** with Download as zip selected, the system (shall) download a zip named `devdigest-ci-<repo-name>.zip` that contains every Preview file at its repository-relative path.
- **AC-19** (US-2) КОЛИ the zip has been downloaded, the system (shall) store the installation with status `manual`.
- **AC-20** (US-1) КОЛИ **Install** is submitted, the system (shall) take only the workflow text from the client and regenerate every other file on the server.

### Generated files

- **AC-21** (US-1) The system (shall) generate the workflow with a `pull_request` trigger whose `types` are exactly the triggers chosen on the Configure step.
- **AC-22** (US-1) The system (shall) generate the workflow job with a condition that skips it for pull requests whose head repository is a fork.
- **AC-23** (US-1) The system (shall) generate the workflow with `permissions` of `contents: read`, plus `pull-requests: write` only when the post mode is not None.
- **AC-24** (US-1) The system (shall) generate a workflow step that runs `node .devdigest/runner/index.js` with `OPENROUTER_API_KEY` taken from the repository secret of that name, `GITHUB_TOKEN` taken from the Actions token and `DEVDIGEST_POST_AS` set to the chosen post mode.
- **AC-25** (US-1, US-5) The system (shall) generate, after the runner step, a fixed step that writes `devdigest-run.json` containing the head commit SHA, the repository full name and the pull request number.
- **AC-26** (US-1, US-5) The system (shall) generate a step that uploads the artifact `devdigest-result` containing `devdigest-result.json` and `devdigest-run.json` and that runs even when the runner step has failed.
- **AC-27** (US-1) The system (shall) put the workflow version number and the text `devdigest/review-action@v1` as a comment only into the workflow header.
- **AC-28** (US-1) The system (shall) write the manifest `.devdigest/agents/<agent-slug>.yaml` from the agent's name, provider, model, system prompt, strategy and `ci_fail_on` in a form that validates against `AgentManifest`.
- **AC-29** (US-1) The system (shall) write one `.devdigest/skills/<skill-slug>.md` for every skill linked to the agent whose link and skill are both enabled, in link order, and list those slugs in the manifest `skills`.
- **AC-30** (US-1) The system (shall) write `.devdigest/memory.jsonl` with one JSON line per `memory` row of `scope='repo'` that belongs to the selected repository.
- **AC-31** (US-1) The system (shall) copy every file of the built `agent-runner/dist` directory, keeping relative names, into `.devdigest/runner/` of the export.

### One agent per repository and update

- **AC-32** (US-1) ПОКИ the selected repository already has an installation of a different agent, the system (shall) disable Continue on the Target step and name that agent.
- **AC-33** (US-1) КОЛИ an export request targets a repository that has an installation of a different agent, the system (shall) answer `409` with code `ci_repo_taken` and change nothing.
- **AC-34** (US-3) КОЛИ an agent is exported to a repository where it already has an installation, the system (shall) update that installation instead of creating a second one.
- **AC-35** (US-3) КОЛИ the user clicks **Update CI config** with an installation selected, the system (shall) open the dialog on its Target step with that installation's repository, triggers and post mode filled in and the repository locked.

### Agent CI tab

- **AC-36** (US-3) The system (shall) show a CI tab after the Evals tab in the agent editor, reachable with `?tab=ci`.
- **AC-37** (US-3) The system (shall) show on the CI tab the heading "CI deployment" with a badge "Active in N repos", where N is the number of the agent's installations with status `active`.
- **AC-38** (US-3) ПОКИ the agent has no installation, the system (shall) show on the CI tab the text "Not deployed to CI yet" and an **Add to CI** button.
- **AC-39** (US-3) The system (shall) show on the CI tab one row per installation with the repository, the target name, the workflow version, the status of its latest run (or the installation status when it has no run) and the relative time of that run.
- **AC-40** (US-3) КОЛИ the user selects an installation row, the system (shall) show below it the 50 newest CI runs of that installation, newest first.
- **AC-41** (US-3) The system (shall) show on the CI tab the Fail CI on control as a segmented control with Never, Critical, Warning + and Any, marking the agent's current value.
- **AC-42** (US-3) КОЛИ the user selects another Fail CI on value, the system (shall) save it as the agent's `ci_fail_on` through the existing agent update.
- **AC-43** (US-3) ПОКИ an installation's workflow version is lower than the current generator version or its exported agent version is lower than the agent's current version, the system (shall) mark its row "Update available".
- **AC-44** (US-3) КОЛИ the user clicks **+ Add repository**, the system (shall) open the dialog on its Target step with no repository preselected.

### CI Runs page

- **AC-45** (US-4) The system (shall) show a CI Runs item in a GLOBAL section of the sidebar that opens `/ci-runs`.
- **AC-46** (US-4) The system (shall) list on the CI Runs page the CI runs of the workspace, newest first and at most 200, with the columns repository, pull request, agent, verdict, findings, cost, duration, run time and job link.
- **AC-47** (US-4) The system (shall) derive a run's verdict on the server from the artifact's severity counts and the `ci_fail_on` recorded on its installation: Request changes when at least one finding meets that threshold (Never never does), Approve when there are no findings, Comment otherwise.
- **AC-48** (US-4) The system (shall) show the findings total with the critical, warning and suggestion counts available as text on hover and to screen readers.
- **AC-49** (US-4) The system (shall) link the job column to the workflow run page address returned by GitHub, opening in a new tab.
- **AC-50** (US-4) The system (shall) let the user filter the CI Runs list by repository, agent and status.
- **AC-51** (US-4) The system (shall) state in the CI Runs page subtitle that results are reported by the repository's own workflow.

### Refresh and ingest

- **AC-52** (US-5) КОЛИ the user clicks **Refresh** on the CI Runs page, the system (shall) fetch the newest workflow runs of every installation in the workspace, ignoring the 30-second debounce.
- **AC-53** (US-5) КОЛИ the user opens the CI Runs page or an agent's CI tab and an installation was last refreshed more than 60 seconds ago or never, the system (shall) start a refresh for that installation.
- **AC-54** (US-5) ПОКИ an installation was refreshed less than 30 seconds ago, the system (shall) skip a refresh request that is not forced and report that installation as skipped.
- **AC-55** (US-5) КОЛИ a refresh runs for an installation, the system (shall) read the 30 newest runs of the workflow file `.github/workflows/devdigest-review.yml` with event `pull_request` in its repository.
- **AC-56** (US-5) КОЛИ a workflow run is queued or in progress, the system (shall) store a CI run with status `running` and no `agent_runs` row, and replace it when the run completes.
- **AC-57** (US-5) КОЛИ a workflow run has completed with conclusion `success`, `failure`, `cancelled` or `timed_out`, the system (shall) store one CI run for it, keyed by GitHub run id and run attempt.
- **AC-58** (US-5) КОЛИ a completed run's artifact `devdigest-result` passes verification, the system (shall) store its findings total, severity counts, cost and duration on the CI run.
- **AC-59** (US-5) КОЛИ a completed run's artifact passes verification, the system (shall) set the CI run status to `failed` when the conclusion is not `success`, to `no_findings` when it is `success` with zero findings, and to `succeeded` otherwise.
- **AC-60** (US-5, US-6) КОЛИ a CI run is stored as completed, the system (shall) write one `agent_runs` row with `source='ci'`, the installation's agent, `pr_id` NULL, status `done` when the artifact passed verification and `failed` otherwise, the run's cost, duration and findings count, and the number of findings that meet the gate as `blockers`, linked from the CI run.
- **AC-61** (US-5) КОЛИ a refresh meets a completed run that is already stored, the system (shall) create neither a second CI run nor a second `agent_runs` row for it.
- **AC-62** (US-5) КОЛИ a refresh finishes, the system (shall) return per installation the numbers of runs added, updated and skipped and the failure code, if any.
- **AC-63** (US-5) КОЛИ `GET /ci/runs` is called, the system (shall) answer from stored rows only, without calling GitHub.
- **AC-64** (US-6) The system (shall) exclude `agent_runs` rows with `source='ci'` from the run count that is the denominator of Skill Stats `pull_frequency`.
- **AC-65** (US-6) The system (shall) show no CI run in any PR list row, PR timeline or PR cost.

## Edge cases

- **EC-1** ЯКЩО no GitHub token is stored when an export or a refresh is requested, ТОДІ the system (shall) answer `409` with code `github_token_missing` and show a message that points to Settings → API Keys.
- **EC-2** ЯКЩО GitHub rejects the commit with `403` or `404` for the workflow path, ТОДІ the system (shall) answer with code `github_permission` and show a message naming the token permissions Contents, Pull requests and Workflows (write) for a fine-grained token, or `repo` and `workflow` for a classic token.
- **EC-3** ЯКЩО the built runner directory `agent-runner/dist` is missing or empty when a preview or an export is requested, ТОДІ the system (shall) answer `409` with code `runner_bundle_missing`, tell the user to run `pnpm --dir agent-runner build`, and make no GitHub call.
- **EC-4** ЯКЩО an export or preview request names a target other than `gha`, ТОДІ the system (shall) answer `422` with code `unsupported_target`.
- **EC-5** ЯКЩО the generated manifest does not validate against `AgentManifest`, ТОДІ the system (shall) answer `422` and write nothing to GitHub or to the database.
- **EC-6** ЯКЩО no trigger is selected, ТОДІ the system (shall) disable Continue on the Configure step and answer `422` to a request that carries none.
- **EC-7** ЯКЩО the agent's provider is not `openrouter`, ТОДІ the system (shall) show in Preview a warning that the bundled runner calls OpenRouter with the agent's model id, and still allow Continue.
- **EC-8** ЯКЩО an export for the same workspace and repository is already running, ТОДІ the system (shall) answer a second export request with `409` and code `ci_export_running`.
- **EC-9** ЯКЩО opening the pull request fails after the commit has succeeded, ТОДІ the system (shall) store no installation, show the error with a Retry button, and reuse the same branch on the retry.
- **EC-10** ЯКЩО GitHub reports that the branch has no difference from the base branch, ТОДІ the system (shall) show "The repository already contains these files" and store no installation.
- **EC-11** ЯКЩО the edited workflow text is not valid YAML or is larger than 64 KiB, ТОДІ the system (shall) answer `422` with the parser message, keep the dialog on the Install step and keep the edited text.
- **EC-12** ЯКЩО the user changes triggers or the post mode on the Configure step after editing the workflow, ТОДІ the system (shall) ask for confirmation before regenerating the workflow and discarding the edit.
- **EC-13** ЯКЩО the user closes the dialog after editing the workflow, ТОДІ the system (shall) ask for confirmation before discarding the edit.
- **EC-14** ЯКЩО the agent has no enabled skill, ТОДІ the system (shall) write no skill file and set the manifest `skills` to an empty list, and still allow the export.
- **EC-15** ЯКЩО two skills produce the same slug, ТОДІ the system (shall) append `-2`, `-3` and so on to the later slugs so that every skill file path is unique.
- **EC-16** ЯКЩО the repository has no `scope='repo'` memory rows, ТОДІ the system (shall) write an empty `.devdigest/memory.jsonl` and show "empty" for it in Preview.
- **EC-17** ЯКЩО the repository has more than 500 `scope='repo'` memory rows, ТОДІ the system (shall) write only the 500 newest and say so in Preview.
- **EC-18** ЯКЩО an agent is deleted, ТОДІ the system (shall) delete its installations and keep their CI runs with the repository and agent name stored on each run.
- **EC-19** ЯКЩО an artifact zip has an entry other than `devdigest-result.json` and `devdigest-run.json`, ТОДІ the system (shall) ignore that entry without reading it.
- **EC-20** ЯКЩО an artifact has more than 64 entries, an entry larger than 256 KiB after inflation, a compressed size above 16 MiB or an entry path that is absolute or contains `..`, ТОДІ the system (shall) reject the artifact with failure reason `artifact_rejected`.
- **EC-21** ЯКЩО the result JSON fails the `CiResultArtifact` schema, or the sidecar's commit SHA differs from the workflow run's head SHA, its repository differs from the installation's repository, or its pull request number differs from the artifact's, ТОДІ the system (shall) store the run as `failed` with failure reason `artifact_rejected`.
- **EC-22** ЯКЩО a completed run has no artifact `devdigest-result`, ТОДІ the system (shall) store it as `failed` with failure reason `no_artifact` and show findings, cost and duration as `—`.
- **EC-23** ЯКЩО GitHub answers `410` for an artifact that has expired, ТОДІ the system (shall) keep the run as `failed` with failure reason `artifact_expired`.
- **EC-24** ЯКЩО a run concluded `cancelled` or `timed_out`, ТОДІ the system (shall) store it as `failed` with that conclusion as failure reason.
- **EC-25** ЯКЩО the stored token lacks permission to read Actions, ТОДІ the system (shall) answer for that installation with code `github_permission` and leave its stored rows unchanged.
- **EC-26** ЯКЩО GitHub rate-limits a refresh, ТОДІ the system (shall) stop it, keep the rows already stored and return code `rate_limited` with the reset time.
- **EC-27** ЯКЩО a refresh for an installation is already running, ТОДІ the system (shall) answer a second request for it with `409` and code `ci_refresh_running`.
- **EC-28** ЯКЩО a CI run has been `running` for more than 24 hours, ТОДІ the system (shall) store it as `failed` with failure reason `stale` on the next refresh.
- **EC-29** ЯКЩО a run's cost or duration is null, ТОДІ the system (shall) show `—` and never `$0.00` or `0 s`.
- **EC-30** ЯКЩО the workspace has no CI run, ТОДІ the system (shall) show on the CI Runs page "No CI runs yet" with the sentence that every automated review appears there once an agent is exported.
- **EC-31** ЯКЩО a refresh request fails or times out after 60 seconds, ТОДІ the system (shall) keep showing the stored rows with a stale-data notice and a Retry button.
- **EC-32** ЯКЩО a repository name, agent name or pull request label is wider than its column, ТОДІ the system (shall) truncate it with an ellipsis and expose the full text on hover and to screen readers.
- **EC-33** ЯКЩО an installation has status `pending_pr` or `manual` and no ingested run, ТОДІ the system (shall) show its status pill as "Pending PR" or "Manual" and the run time as `—`.
- **EC-34** ЯКЩО the installation rows existed before the migration, ТОДІ the system (shall) keep them, with `workspace_id` taken from their agent and status `active`.
- **EC-35** ЯКЩО an export request from the dialog is pending, ТОДІ the system (shall) keep the Install button disabled.
- **EC-36** ЯКЩО a workflow run concluded `skipped`, ТОДІ the system (shall) store no CI run for it.
- **EC-37** ЯКЩО a run's cost is exactly zero, ТОДІ the system (shall) show `$0.00`.

## Non-functional requirements

- **NFR-1** The system (shall) scope every `ci` route and query to the caller's `workspace_id` through `getContext()`, with `workspace_id` stored on `ci_installations` and `ci_runs`.
- **NFR-2** The system (shall) enforce one agent per repository with a database unique constraint on workspace and case-insensitive repository name, so that two concurrent installs cannot both succeed.
- **NFR-3** The system (shall) ship the schema change as a generated migration (`pnpm db:generate`) that applies on a database with existing rows without data loss.
- **NFR-4** The system (shall) add every new or changed shared contract to both vendor copies of `@devdigest/shared` in the same change, with fields that have `.default()` on the server marked `.optional()` in the client copy.
- **NFR-5** The system (shall) generate byte-identical files on two calls with the same agent, skills, memory, runner build and settings.
- **NFR-6** The system (shall) build the workflow and the manifest with a structured YAML serializer, never by string concatenation of agent or user text.
- **NFR-7** The system (shall) reference every third-party action in the generated workflow by its full commit SHA.
- **NFR-8** The system (shall) return the Preview file list within 2 seconds for an agent with 10 skills on the seeded database, with runner file contents left out of the response.
- **NFR-9** The system (shall) make at most 61 GitHub API calls per installation in one refresh: one workflow run listing plus one artifact listing and one download for each of at most 30 runs.
- **NFR-10** The system (shall) finish a refresh response within 60 seconds.
- **NFR-11** The system (shall) make zero LLM calls in any `ci` route.
- **NFR-12** The system (shall) keep the GitHub token and `OPENROUTER_API_KEY` out of logs, API responses, generated files, the PR body and error messages, and truncate GitHub error text to 200 characters.
- **NFR-13** The system (shall) meet WCAG 2.1 AA in the wizard: dialog role, focus kept inside, Esc to close, `aria-current="step"` on the current step, `aria-pressed` on trigger toggles, status text announced through `aria-live`, and verdict and status never shown by colour alone.
- **NFR-14** The system (shall) keep the Continue and Install buttons visible without horizontal scrolling in a 768 px wide window.
- **NFR-15** The system (shall) read every new user-facing string from `client/messages/<locale>/ci.json`, and remove the keys "Publish to CI" and "Requires a GitHub App".
- **NFR-16** The system (shall) keep the PR list rows, the PR timeline run list and the PR cost values for a PR identical before and after a refresh, verified by a test that snapshots those readers.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Agent name, provider, model, system prompt, strategy, `ci_fail_on`, version | `agents` row | yes (authored in the studio); exported text is user content | designs 4, 5; `AgentManifest` in `eval-ci.ts` |
| Exported skills and order | `agent_skills` + `skills` rows, enabled only | yes; flagged-injection skills are already forced to `enabled=false` | design 4 (skill files) |
| Repo memory rows | `memory` table, `scope='repo'`, `repo_id` of the selected repository | yes, may hold sensitive text; shown in Preview before commit | design 4 (`memory.jsonl`), user answer Q4 |
| Runner files | built output of `agent-runner/dist`, copied whole | yes (own build); size and runnability unverified | `agent-runner/CLAUDE.md`; researcher R1, R2 |
| Selected repository, default branch | `repos` row (`full_name`, `default_branch`) | yes after lookup in the workspace; the client value is not trusted | designs 2, 6 |
| Target, triggers, post mode | client input, validated as enums | no | designs 1, 5 |
| Edited workflow text | client input | no | design 4 |
| GitHub token | secrets file, key `GITHUB_TOKEN` | yes, secret | `container.ts` secrets chokepoint |
| Generator and workflow version, action pins, check name | constants of the `ci` module | yes | design 5 (check text); user text |
| Install PR URL | GitHub API response | yes (api.github.com), re-checked before rendering as a link | design 6 |
| Workflow run id, attempt, status, conclusion, head SHA, head repository, event, `html_url`, timestamps | GitHub Actions API | partly: origin-checked, content influenced by PR authors | researcher R1, R4 |
| Result artifact (`devdigest-result.json`) | GitHub artifact download (zip) | no — a PR author can forge it | `CiResultArtifact`; researcher R4 |
| Run sidecar (`devdigest-run.json`) | artifact entry written by the generated workflow step | no | researcher R1 |
| Findings count, severity counts, cost, duration | artifact | no, bounded and validated | design 2 pills; user text |
| Verdict, blockers, status | derived on the server from counts, conclusion and installation `ci_fail_on` | yes | user text (verdict column) |
| Installation status, workflow version, agent version, `ci_fail_on` as exported, PR URL, last refresh time | `ci_installations` row | yes | designs 2, 3 |
| Skill Stats run count | `agent_runs` readers | yes | researcher R3 |

## Untrusted inputs

- **UI-1** Agent name, system prompt and skill bodies → YAML manifest and Markdown files in the target repository: the system (shall) write them through a structured serializer and as file content only, never into a path, a shell command or the workflow text.
- **UI-2** Agent and skill names → file paths and the manifest `skills` list: the system (shall) derive slugs that match `[a-z0-9-]`, at most 64 characters, with no leading dot and no path separator.
- **UI-3** Edited workflow text from the client → committed file: the system (shall) accept it only for the fixed path `.github/workflows/devdigest-review.yml`, only as valid YAML of at most 64 KiB.
- **UI-4** Repository name from the client → GitHub API URLs and branch operations: the system (shall) accept only a `full_name` that matches a repository connected in the caller's workspace.
- **UI-5** Memory content → `.devdigest/memory.jsonl` in a possibly public repository: the system (shall) serialise each row as one escaped JSON line and show the whole file in Preview before the commit.
- **UI-6** Triggers and post mode from the client → workflow YAML: the system (shall) validate them against the enums `opened|synchronize|reopened` and `github_review|pr_comment|none` and refuse any other value.
- **UI-7** Pull request title, body and branch name inside the generated workflow → shell: the system (shall) never place `${{ github.event.* }}` or any agent or user text into a `run:` line and pass values only through `env:`.
- **UI-8** Artifact zip from GitHub → inflater and database: the system (shall) read only the two known entries, apply the size, entry-count and path limits of the edge cases, and validate the content with Zod and with numeric bounds before storing it.
- **UI-9** Artifact field `agent` and any other artifact text → CI Runs UI: the system (shall) ignore them for display and show the agent name stored on the installation.
- **UI-10** Forged counts, cost or duration in an artifact → CI Runs numbers: the system (shall) check the run's origin by workflow path, head SHA, head repository, event and sidecar, and label results as reported by the repository's workflow.
- **UI-11** `html_url` from the GitHub API → job link: the system (shall) render the link only when it starts with `https://github.com/` and contains `/<repository>/actions/runs/`.
- **UI-12** Repository and pull request number from artifact or run → pull request link: the system (shall) build the link as `https://github.com/<repository>/pull/<n>` with an integer `n` and never from a URL in the artifact.
- **UI-13** GitHub error bodies → UI and logs: the system (shall) show them as plain text truncated to 200 characters with the token removed.

## Open questions

- **Q-1** Which Node major does the generated workflow set up? The design shows `node-version: 20`, the runner README states native `fetch` on Node 22 — default: 22 — owner: user.
- **Q-2** Does the copied runner directory run standalone with `node .devdigest/runner/index.js` on a clean checkout (ESM or CJS build, `package.json` and chunk files next to `index.js`, the direct-run guard on `import.meta.url`)? researcher R2 could not execute it — default: verify with a scratch run on Node 22 during implementation; a failure needs a new decision because runner edits are not granted — owner: user.
- **Q-3** Should the job column link to the workflow run page or to the single job page? The job page needs one more API call per run — default: workflow run page — owner: user.
- **Q-4** AC-64 changes `countRunsByAgents` in `skills/repository.ts`, outside the `ci` module (researcher R3: it counts CI rows today) — default: add the one-line `source` filter in this spec — owner: user.
- **Q-5** Which installation does the header button **Update CI config** act on? — default: the selected row, or the first row when none is selected — owner: user.
- **Q-6** The GitHub adapter times out after 30 s (`octokit.ts:18`) and the runner files are about 1.6 MB (researcher R1) — default: raise the timeout of `commitFiles` to 120 s — owner: user.
- **Q-7** A merged `devdigest/ci` branch may be stale on the next update — default: reuse the branch as it is, no reset from the default branch — owner: user.
- **Q-8** Should result content be verified with artifact attestations? Private repositories need GitHub Enterprise Cloud (researcher R4) — default: no, label results as reported — owner: user.
- **Q-9** The caps chosen in this draft (500 memory rows, 64 KiB workflow, 30 runs per refresh, 50 history rows, 200 rows on CI Runs, 24 h for stale) — default: keep them — owner: user.
- **Q-10** Add an e2e flow for the CI tab and wizard up to the Install step with GitHub mocked? — default: yes, one flow — owner: user.
- **Q-11** Other worktrees may add Memory, Multi-Agent Review and Agent Performance to the same GLOBAL sidebar section — default: add the section with CI Runs only and resolve conflicts at merge — owner: user.
- **Q-12** The verdict uses the `ci_fail_on` recorded at export, while the runner reads the manifest committed in the repo, which a user may have edited — default: accept the possible difference — owner: user.
- **Q-13** The full commit SHAs for `actions/checkout`, `actions/setup-node` and `actions/upload-artifact` must be looked up when the plan is made — default: a researcher run during planning — owner: implementation-planner.
- **Q-14** An installation whose PR was closed without a merge stays `pending_pr` — default: accept, no PR state polling — owner: user.
