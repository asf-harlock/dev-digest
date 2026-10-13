# CI review ledger

`ci-review-ledger.jsonl` — one JSON object per line, measured, never typed in. Separate from
`history.jsonl` (one row per `/workflow-retro`, no dollars, no conflicts).

Rebuild or extend it with `scripts/ci-review-ledger.mjs` (Node ≥ 22, `gh` logged in):

```sh
node scripts/ci-review-ledger.mjs --pr 31:pass --pr 32:critical \
  --studio http://localhost:3001 --studio-run --agents "Security Reviewer,API Contract Reviewer"
node scripts/ci-review-ledger.mjs --build-metrics <metrics.json from /workflow-retro collect.mjs>
```

A row is replaced (not duplicated) when the same PR + head commit, or the same build session, is recorded again.
A figure that could not be measured is `null` and has a reason next to it.

## `type: "ci-review"` — one pull request

| field | source | meaning |
|---|---|---|
| `pr`, `kind`, `url`, `title`, `head_sha` | `gh pr view` | the PR; `kind` is the label given on the command line (`pass`, `critical`) |
| `run_id`, `run_url`, `run_attempt` | `gh run view` | the `DevDigest Review` run for `head_sha` |
| `review_check` | job conclusion | result of the required check `review` |
| `merge_state` | `mergeStateStatus` | GitHub's verdict with branch protection on `main`: `CLEAN` mergeable, `BLOCKED` not |
| `pr_opened_at`, `job_started_at`, `job_completed_at` | GitHub | timestamps |
| `queue_s` | derived | PR opened → job started |
| `job_s` | derived | job started → completed (checkout, Node setup, review, upload) |
| `wall_clock_s` | derived | PR opened → required check finished: the time a developer waits |
| `review_ms` | artifact `duration_ms` | the model review call alone (`reviewPullRequest` in the runner) |
| `cost_usd`, `tokens_in`, `tokens_out` | artifact | the CI review's own LLM cost and tokens, as counted by the engine |
| `findings` | artifact | `total`, `critical`, `warning`, `suggestion` after the grounding gate |
| `conflicts` | studio multi-agent run | see below |

### `conflicts`

Conflicts are a SPEC-11 notion: places where several agents disagree on the same file and line range. The CI
workflow runs ONE agent, so it cannot produce any. They are measured in the studio, by running a multi-agent
review of the same PR:

- `measured: true` — `groups` = grouped locations, `contended` = groups where agents differ (one flagged, another
  did not, or severities differ), `agents[]` = per agent status, duration, cost, tokens, findings, and `saw_diff`.
- `measured: false` — with `reason`. The most important one: **an agent that reviewed an empty diff proves
  nothing.** The studio reads the diff from its own git clone; if the clone lacks the PR head the agents get
  `0 changed file(s)` and report zero findings. The script reads each run's trace and refuses to record
  conflicts when any agent saw no diff. Fetch first (`POST /repos/:id/context/rescan`), then re-run.

Tokens and cost inside `conflicts.agents` are the STUDIO's own runs (a longer prompt: repo map, context), so they
differ from the CI figures on the same PR. They are a separate review, not a re-count of the CI one.

## `type: "build"` — the agent work that produced a change

From a `/workflow-retro` `collect.mjs` `metrics.json`: `wall_min`, `active_min`, `agents`, `tokens`.
`tokens.fresh` = input + cache_write + output; `cache_read` is large, cheap and reported separately — do not add it
into "tokens spent". Pass `--from` to `collect.mjs` to window a session that did other work.

## Results snapshot — 2026-10-13 (fixture PRs #31 and #32)

Copied from the rows in `ci-review-ledger.jsonl`; the JSONL is the source of truth.

| | #31 clean | #32 CRITICAL |
|---|---|---|
| required check `review` / merge state | success / `CLEAN` | failure / `BLOCKED` |
| findings | 0 | 3 critical (SQL injection, command injection, hardcoded password) |
| tokens in / out (CI review) | 1 889 / 52 | 2 028 / 1 744 |
| cost (CI review) | $0.000195 | $0.000456 |
| wall-clock, PR opened → check finished | 17 s (queue 5 + job 12) | 58 s (queue 6 + job 52) |
| review time (the model call) | 3.7 s | 43.0 s |
| conflicts between agents (studio, 2 agents) | 0 groups | 3 groups, all contended: Security Reviewer flagged all three, API Contract Reviewer none |

Agent work that built the change (`type: "build"`, window 14:15–14:49 UTC): 33.9 min wall-clock, 31.6 active,
4 subagents, 586 299 fresh tokens (input 256 + cache write 505 209 + output 80 834); cache read 18 516 456 is
reported separately.

Caveats: the build row was taken at 14:49 UTC and excludes later work. Tokens under `conflicts.agents` are the
studio's own runs (longer prompt, ~3.7–3.9k in) and are not comparable to the CI figures on the same PR. Before
PR #30 the CI artifact carried no tokens at all.
