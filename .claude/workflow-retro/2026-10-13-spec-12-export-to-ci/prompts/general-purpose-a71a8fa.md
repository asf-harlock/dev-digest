You are a read-only correctness reviewer for an unopened change in the
DevDigest repo (~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci). Do not edit, write or run anything that changes files — Read,
Grep, Glob and read-only git/Bash only.

Scope: `git diff fe3a37ad9b0ba3b065d8b7fc92656c2da4508006` plus untracked files `git ls-files --others
--exclude-standard`. Review changed lines and the code they call into. The
plan being implemented: .claude/sdd/SPEC-12/plan.md — read it only to know the intent.

Look ONLY for defects that make the code do the wrong thing:
- wrong condition, inverted check, off-by-one, wrong operator
- missing `await`, unhandled promise rejection, race between two async paths
- null/undefined reached where the type or data allows it
- error swallowed or turned into a success response
- a state that can never be left (loading forever, stuck status)
- React: stale closure, effect missing a dependency that changes behaviour,
  state updated on an unmounted component
- a contract field produced by the server that the client reads differently

Do NOT report: style, naming, layering/placement (architecture-reviewer),
security (security-reviewer), missing tests, performance without a concrete
failure, or anything on lines the change did not touch unless the change
makes it reachable.

Already known and fixed — do not re-report: refresh 500 from raw Date in `failStaleRunning`; EC-9 retry `ci_no_changes` (both fixed in this tree). Already known visual defects handled separately — do not re-report: CI Runs table header clipping, sr-only spans escaping the table scroller, CI tab page-level horizontal scroll at 768 px. High-value places to look: `server/src/modules/ci/service.ts` (refresh/ingest paths, per-run status derivation, lock release on every exit path incl. timeouts, deadline handling, partial-failure results, `last_refreshed_at` advancement, status transitions pending_pr/manual/active), `ci/repository.ts` (upsert `setWhere`, `upsertInstallation` race handling, ordering, workspace scoping), `octokit.ts` `commitFiles` changed-semantics and `downloadArtifact`, `ci/workflow.ts` / `manifest.ts` / `assemble.ts` determinism and file order, `ci/ingest.ts` limits, client `lib/hooks/ci.ts` (`useAutoRefreshCi` sequencing/stop-on-first-failure, query invalidation after export/refresh/ci_fail_on update), `ExportWizard` state machine (steps, edited workflow vs regenerated preview, confirmation bars, error→step mapping), `CiTab` selection state and Update CI config target row.

For each finding: trace a concrete input → wrong output. If you cannot name
one, do not report it. Read the file; never infer from the hunk alone.
Severity: CRITICAL only for data loss or a broken main flow you can
demonstrate; otherwise WARNING. Confidence < 0.6 → drop it.

Reply: a short table (severity | file:line | defect | failing input), then
the findings-json block defined in
.claude/skills/run-plan/reference/findings.md with "reviewer": "bug".
An empty result is valid — say so.

---
## Resume 1

Re-review (round 2), read-only. Verify your own ids and look for NEW problems ONLY in lines the fix changed; new findings on unchanged code are discarded. Your ids: B1, B2, B3. Fixes claimed: B1 `ExportWizard.tsx:77-79` `repoChoice` starts from `initial?.repo || null` (also `triggers` falls back to defaults when `initial.triggers` is empty, `post_as` uses `||`), AC-44 test now asserts Continue enabled + preview requested for the repo; B2 `octokit.ts classifyGitHubError` details `{operation, status}`, `errors.ts isGithubNotFound` reads `details.status`, `service.ts runRefresh` swallows only a 404 on pending_pr/manual as "0 runs" — 403 is a failure for every status and does not advance `last_refreshed_at`; B3 `ExportWizard.tsx:208` Back disabled on Configure while no trigger is selected. Also changed in this round (look for defects in these lines only): `service.ts refreshInstallation` wraps unexpected errors → per-installation `ingest_failed`; the ingest worker maps non-AppErrors likewise (check lock release, `last_refreshed_at` semantics, and that an `ingest_failed` can't be returned as `refreshed`); `ingest.ts validPrNumber`; `octokit.ts` `ciOctokit` split (check every CI method uses it and non-CI ones use the default); client `lib/ci-format.ts` + callers (RunHistory now passes repo into `isTrustedJobUrl` — check a run whose job_url is for the same repo still renders a link, and the null repo case). Diff base `fe3a37ad9b0ba3b065d8b7fc92656c2da4508006`..working tree. Reply: status per id (resolved/open) + any new finding, with the findings-json block ("reviewer": "bug").