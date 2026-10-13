## Hand-back 1

## Implementation report: SPEC-10 Phase B, W2-B server (steps B4-B10)

### Plan step → change
Skills applied: onion-architecture, fastify-best-practices, zod, security, typescript-expert, drizzle-orm-patterns. They were loaded once and match the plan's backend and repository buckets. I did not re-resolve `routing.json` per file, so there was no mismatch to surface.

1. **B4, `scope='set'` plumbing and scope on records.** Files: `server/src/modules/eval/repository.ts`, `helpers.ts`, `types.ts`, `constants.ts`.
   - `insertRun` and `insertSkillRun` take an optional `scope` that defaults to `'set'`.
   - Set-only filter: `scope='set'` sits in `agentRuns()` and `skillRuns()`. That covers `latestFinishedRunRow`, `listRunSummaries`, `countFinishedRuns`, `listSkillRunSummaries`, `listSkillTrendRows` and `latestFinishedSkillResults`. `recentRunSummaries` carries its own filter, which also covers the dashboard.
   - I grepped every `t.evalRuns` select. The only other reader of the table is `src/app.ts`, which goes through the reaper.
   - Left unfiltered by design: `getRun`/`getRunRow`, `deleteByAgent`/`deleteBySkill`, `reapRunning`, `saveProgress`/`saveSkillProgress`, `finalizeRun`/`finalizeSkillRun`, `isRunning`, `runningRun` by id, and the 409 lookup.
   - `scope` is in `summarySelection` and `skillSummarySelection`. It is mapped in `toRunRecord`, `toSkillRunRecord`, `summaryFromRow` and `skillSummaryFromRow`, so `toRunDetail` and `toSkillRunDetail` inherit it.
   - `types.ts` gained `scope` on both summaries, `CaseResultSource`, `RunningCaseRun` and `RunTarget`.
   - `constants.ts` gained `RUN_SCOPE`, `CASE_RUN_RESULT_STATUSES`, `INVALID_CASE_RUN_BODY_MESSAGE` and `CARRIER_REQUIRED_MESSAGE`.
2. **B5, running readers.** Files: `repository.ts`, `service.ts`, `helpers.ts`.
   - `runningRunId` and `runningSkillRunId` are now set-only and feed `running_run_id`.
   - New `runningCaseRun(ws, owner)` reads `case_set->0->>'id'` and feeds `running_case_run`.
   - New private `anyRunningRunId(ws, owner)` serves the 409 `details.run_id` in both inserts and is any-scope.
   - `overview` and `skillOverview` return `running_case_run` through `toRunningCaseRun`.
3. **B6, per-case reader.** Files: `repository.ts`, `helpers.ts`, `service.ts`.
   - New `latestResultsByCase(ws, owner, caseIds)` merges the newest finished set run's outcome with the newest case run.
   - Set side: it reuses `latestFinishedRunRow` / `latestFinishedSkillResults`, so at most one set run's `case_results` is read.
   - Case side: a `selectDistinctOn` over scalar columns picks one case-run id per case, then `case_results` is read for those winners only.
   - Pure helpers `pickLatestSource` (later start wins), `sourceOutcomes` and `toFrozenCase` are in `helpers.ts`.
   - `listCases`, `getCase`/`latestResultOf` and `listSkillCases` now use the reader.
   - A crashed or reaped case run stores no outcome, so it surfaces as an errored placeholder built from the run's `error_reason` and duration.
4. **B7, `startCaseRun`.** File: `service.ts`.
   - `startRun` and `startSkillRun` are now thin wrappers over `launchAgentRun` and `launchSkillRun`. Both take a `RunTarget` (`{scope:'set'}` or `{scope:'case', frozen}`), so there is no second run path.
   - Order: 404 case, then branch on `owner_kind`. A skill-owned case without a carrier gets 422 `validation_error`. After that, the existing 404 carrier and 422 `no_agent_linked` checks apply.
   - A disabled owner is allowed because `requireAgent` never checked `enabled`.
   - The frozen input is read once from the case row at start (EC-26).
   - EC-27 is unchanged: the existing `isRunning` checks before each arm already stop a skill run before the second arm.
   - Log lines carry only ids, `ownerKind`, `scope`, `caseId` (case runs), counts, status and duration (NFR-12).
5. **B8, routes.** File: `routes.ts`.
   - `POST /eval-cases/:id/run`: `schema.params`, `response: {202: EvalRunStart}`, optional body hand-parsed with `SkillEvalRunRequest.safeParse(req.body ?? undefined)`, 422 when a body is present but invalid, with the INSIGHTS 2026-09-20 comment, and `req.log` passed through.
   - `GET /eval-runs/:id` returns `scope` through the mappers.
   - `compare` returns 404 when either run is a case run.
   - The reaper needed no change.
6. **B9, fixtures.** Files: `test/contracts.test.ts`, `src/modules/eval/service.test.ts`, `src/modules/eval/helpers.test.ts`.
   - `contracts.test.ts`: added `scope: 'set'` to the `run()` and `skillRun()` fixtures and `running_case_run: null` to the overview fixtures. This fixed the 7 failing tests, with no assertion edits.
   - `service.test.ts`: added a `latestResultsByCase` stub to the fake repo.
   - `helpers.test.ts`: added `scope: 'set'` to one typed fixture. This file was not on your list, but its typecheck broke because of my `EvalRunSummary.scope`.
   - `service-skill-run.test.ts` and the ITs needed no edits.
7. **B10, docs.** File: `server/README.md`. Added a "Single-case eval run (SPEC-10)" section covering the route, the 409 rule, `scope`, `running_case_run` and the set-only vs per-case rules.

### Tests run
- `./scripts/check.sh server typecheck`: PASS
- `./scripts/check.sh server lint`: PASS
- `./scripts/check.sh server arch`: PASS
- `./scripts/check.sh server test`: PASS (798 passed). This includes `eval-contract-parity` and `contracts.test.ts`.
- `./scripts/check.sh core typecheck`: PASS
- `cd server && pnpm exec vitest run eval-cases skill-eval eval.it eval-trend skill-eval-runs`: 6 files, 110 tests, all pass. Migration 0025 was applied by Testcontainers, and no assertion was edited (NFR-15).
- A throwaway IT covered the new behaviour end to end against a real Postgres, then I deleted it, so no new test file remains. It checked the following; the test-writer should reproduce these in the real tests.
  - The agent set run, then a case run held open: `running_run_id` stays null, `running_case_run` is set, and a set start and a case start both give 409 with `details.run_id`.
  - An errored case run (provider failure) becomes the case's latest result with its `error_reason`, while the sibling case keeps its set-run result.
  - The overview and dashboard are unchanged after case runs.
  - A passing case run supersedes the errored one.
  - `compare` returns 404 for a case run.
  - Unknown case gives 404, and a bad carrier body gives 422.
  - A reaper-style errored case run with empty results still surfaces as `errored` / `interrupted`.
  - A skill case run: 422 without a carrier, 422 `no_agent_linked`, 2 LLM calls, `running_case_run` on the skill overview, 409 against a skill set run, `effect: no_effect_pass`, and `latest: null` and no trend afterwards.
- `./scripts/check.sh server test` excludes the ITs. The Docker-backed ITs above were run by hand. `server/test/eval-contract-parity.test.ts` runs inside `server test` and passes.

### Self-check
- Diff matches the plan: yes, with the deviations below.
- Naming and Do-not-touch rules: yes. I did not edit vendor, schema or migrations, and I created no new test file.
- i18n: n/a (server only).

### Deviations from plan
- **Case-run lookup uses `case_set->0->>'id'`, not `@>` containment.** I used a single `selectDistinctOn` keyed on `case_set->0->>'id'`, restricted to the owner's `scope='case'` rows with status `completed|partial|errored`. A case run's `case_set` always holds exactly one case, so it is equivalent. The query reads only scalars, then `case_results` of the winners, and never scans set runs or case results. If you want literal `@>` containment, it is a one-line change, but it needs N queries or an OR chain.
- **A crashed or reaped case run is synthesized as an errored result.** It stores no outcome, so the placeholder is built from `error_reason` and duration. Its `findings` is `[]`, which means the actual-output pane shows `[]`, not "Never run yet".
- **Skill-case status mapping (AC-38) needed no change.** For one case, `finalStatus` can only return `completed` or `errored`: an errored case has `traces_total = 0`, and `partial` needs `cases_errored > 0` plus a scored case. `pairArms` makes an errored arm an errored case in both arms.
- `startRun` / `startSkillRun` keep their signatures. `executeRun` (private) now takes a log-ids object, like `executeSkillRun`.

### Decisions the caller must know
- **`POST /eval-cases/:id/run` body handling.** The body is hand-parsed. An absent or null body means "no carrier". A body that is present but not `{carrier_agent_id: uuid}` is 422, **including `{}`**. The W3-B client must send no body for agent-owned cases, or an object with a valid carrier id. A skill-owned case with no carrier gets 422 `validation_error`.
- **Tie rule.** On an exact `started_at` tie, the set run wins. This is practically impossible because of single-flight.
- **Set-run `latest_result` source.** It still comes from the newest finished set run only. A case missing from it gets no set-side result, as before.
- **Scope filter on the dashboard.** `recent_runs` and the sparklines are set-only. Errored and running set runs still appear in `recent_runs`, as before.
- **Contract fixtures outside my files.** Client-side typed fixtures need `scope` and `running_case_run`. That is W3-B's work.
- **Local DB.** It is not migrated yet. The user must run `pnpm db:migrate` before trying the case-run route.

### Tests the test-writer should add
Hermetic `server/src/modules/eval/case-run.test.ts`:
- `pickLatestSource`: the later case run wins; an older case run loses to a set run; either side alone; the tie goes to the set run.
- `sourceOutcomes`: a source with an outcome passes through unchanged; a source with no outcome gives an errored placeholder carrying `runErrorReason`, `runDurationMs` and the `CASE_ERROR_FALLBACK` fallback; paired gives both arms and unpaired gives `without` undefined.
- `toRunningCaseRun` null and set, `toFrozenCase`, and `scope` in `toRunRecord` / `toSkillRunRecord` / `summaryFromRow`.
- A fixture with no `findings` through `toLatestResult` gives `null`.
- A service test (fake repo, as in `service-skill-run.test.ts`) for `startCaseRun`:
  - 404 case; 422 for a skill case with no carrier; 404 carrier; `no_agent_linked`;
  - the insert gets `scope: 'case'` and a one-case `caseSet`;
  - a disabled agent still runs;
  - the LLM is called 1 time (agent) or 2 times (skill);
  - skill delete mid-run makes no second-arm call and logs no error;
  - the log lines contain no diff, prompt or finding text.

DB-backed `server/test/eval-case-run.it.test.ts`:
- The NFR-18 snapshot test: after a set run, snapshot `latest`, `previous`, `trend`, `runs`, `finished_runs`, `sparkline`, `recent_runs`, both overviews, the dashboard and `running_run_id`. Then finish a case run and assert they are equal, with only that case's `latest_result` changed.
- The 409 guard in both directions, for agent and skill owners.
- `running_case_run` on both overviews, and `running_run_id` null while a case run runs.
- An errored case run is the case's `latest_result` after reload (AC-46, EC-21).
- A reaped case run (`reapStaleRuns`) gives `errored` / `interrupted` and is still the latest result (EC-22).
- `compare` 404 for a case id, in either position.
- `GET /eval-runs/:id` for agent and skill case runs returns `scope: 'case'`, `case_set` of length 1, `cases_done` and `cases_total`.
- Workspace 404 for a case in another workspace (EC-29).
- Provider call counts of 1 (agent) and 2 (skill) (NFR-2), and no rows in `reviews`, `findings`, `agent_runs`, `agent_run_skills` or `run_traces` (NFR-3).
- Deleting an agent or skill with a case run removes it (EC-27).
- `POST` with `{}`, a bad UUID or a malformed carrier returns 422.

### Handoff note
- The architecture review should look at three things. First, `repository.ts` now imports `pickLatestSource` and `toFrozenCase` from `helpers.ts`; this is allowed because the repository already imported helpers. Second, `helpers.ts` now imports `scoring.ts`; I found no cycle. Third, the DISTINCT ON choice above.
- Security review: the new route is workspace-scoped through `getCase` and the existing carrier checks. The case-key expression has no user input in it, and ids are bound parameters. Logging carries ids only.
- Docs left for the engineering-insights skill: `server/INSIGHTS.md` 2026-10-11 ("every reader selecting `t.evalRuns` must be reviewed for `scope`") is now mechanical for the predicates, but a reader that bypasses `agentRuns()`/`skillRuns()` still needs its own filter.
- Files changed by me: `server/src/modules/eval/{routes,service,repository,helpers,constants,types}.ts`, `server/src/modules/eval/{service,helpers}.test.ts`, `server/test/contracts.test.ts`, `server/README.md`. I did not touch `rows.ts` because typing did not need it.