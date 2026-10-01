# Spec: Run Cost
Spec ID: SPEC-01
Status: draft
Supersedes: —

<!-- Worked example: specs/01-run-cost.md rewritten in the SPEC format.
     The original stays in its older format; this copy exists only to show
     the target shape. It passes scripts/lint-spec.mjs. -->

## Проблема й користувач

A developer choosing between a cheap-fast and a thorough-expensive model has
no way to see what a review actually cost. The server already computes the
number — OpenRouter returns `usage.cost`, and for OpenAI/Anthropic
`estimateCost()` derives it from token usage and the price book — and then
discards it, so "what did reviewing this PR cost" has no answer anywhere in
the UI.

## Goals / Non-goals

**Goals**
- Persist the USD cost of every completed run.
- Show it on the PR list, the PR timeline and the run drawer.

**Non-goals**
- Budgets, alerts, caps or any spend-limiting behaviour.
- Aggregation across PRs, repos or time — that is the Agent Performance screen.
- Cost on the verdict banner or the review accordion.
- Backfilling runs written before this change; they stay `NULL`.
- Not doing a second pricing source — considered and rejected because it
  would make two numbers for one run disagree.

## User stories

- **US-1** As a developer, I want to see what reviewing a PR cost, so that I
  can judge whether the model I picked is worth it.
- **US-2** As a developer, I want to see the cost of a single run next to its
  tokens and duration, so that I can compare runs of different agents.

## Acceptance criteria (EARS)

- **AC-1** (US-1, US-2) КОЛИ a run reaches `status='done'`, the system (shall)
  persist its cost in `agent_runs.cost_usd` and return it as `cost_usd` from
  `GET /pulls/:id/runs`.
- **AC-2** (US-1) The system (shall) show, in the PR list COST column, the
  cost of the latest run with `status='done'` for that PR.
- **AC-3** (US-2) КОЛИ a run has settled, the system (shall) show its total
  tokens and cost under its timestamp in the PR timeline, formatted as
  `9,119 tok · $0.0013`.
- **AC-4** (US-2) The system (shall) show a COST tile in the run drawer's Stats
  row beside DURATION, TOKENS and FINDINGS.
- **AC-5** (US-1, US-2) The system (shall) render a cost below one cent with
  four decimal places (`$0.0013`), never rounded to `$0.00`.

## Edge cases

- **EC-1** ЯКЩО the provider reports no usage or pricing for a run, ТОДІ the
  system (shall) store `cost_usd` as `NULL` and render `—`, never `$0.00`.
- **EC-2** ЯКЩО a PR has no run with `status='done'`, ТОДІ the system (shall)
  render `—` in its COST column.
- **EC-3** ЯКЩО a run is still `running`, ТОДІ the system (shall) show neither
  tokens nor cost in its timeline row.
- **EC-4** ЯКЩО a `run_traces.trace` document was written before `cost_usd`
  existed, ТОДІ the system (shall) still parse it, with cost treated as
  unknown.

## Non-functional requirements

- **NFR-1** The system (shall) make zero additional model calls to obtain the
  cost; every number comes from the run row.
- **NFR-2** The system (shall) scope every cost read to the caller's
  `workspace_id` through `getContext()`.

## Inputs and provenance

| Value | Source | Trusted? | Design source |
|---|---|---|---|
| Run cost (OpenRouter) | provider response `usage.cost` | yes — our provider, numeric | code: `estimateCost()` call site |
| Run cost (OpenAI/Anthropic) | `usage.prompt_tokens`/`completion_tokens` × price book | yes | code |
| Tokens | `agent_runs` token columns | yes | code |
| Latest done run per PR | `agent_runs` where `status='done'` | yes | user text |

## Untrusted inputs

None — the feature reads only numeric provider usage fields and our own
price book; no author- or model-controlled text reaches a new sink.

## Open questions

- **Q-1** Should the PR list sum all completed runs instead of showing the
  latest? — default: latest run only, matching the existing `score` field —
  owner: user.
