## Hand-back 1

## Test-writing report: SPEC-09 Phase B (skill eval runner)

All the Phase B tests you listed are written and green. I found no implementation bugs, I changed no non-test source, and I lacked no seam. There is one lint/typecheck caveat (typecheck was run after the server fix and was clean) and one limit on the EC-24 "no error log" check (both under Run results).

### Tests added
Skills applied: backend bucket (fastify-best-practices, typescript-expert) for the `server/` files. The client files were only run through the client gates, and I did not load the react-testing-library skill.

- **`/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/arms.test.ts`** (new, 30 tests, hermetic)
  - `buildArms`: without-arm is the carrier's enabled skills in link order minus the skill under test. The with-arm splices the skill under test at its link position regardless of both enable flags.
  - AC-24 tie rule: the skill under test goes after every other skill with the same `order`, including ties at order 0. The stable tie order is also covered, and `linkOrder === null` appends last.
  - `pairArms`: errored in either arm is errored in both and keeps the real reason (the with arm's reason when both fail). A case missing from the without arm gets the fallback reason. Healthy cases pass through unchanged, and errored cases drop out of both arms' metrics.
  - EC-17 (all errored) is covered through pairing, lift, cost and effects.
  - `computeLift`: raw unrounded fractions, negative lift, a null side gives null in either direction, and 0 is not null. EC-25 and EC-26 are covered.
  - `classifyEffect(s)`: all five values (AC-31), plus the case where the without arm has no counterpart.
  - `skillRunCost`: sums both arms, null if any arm of any scored case is null, an errored paired case does not null it, and nothing scored gives null (EC-27).
- **`/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/arms-prompt-parity.test.ts`** (new, 4 tests, hermetic) is the D7/AC-27 prompt-parity test.
  - Seam used: the real chain `buildArms` → `buildSkillRunSnapshot` → `armSnapshot` → `reviewFrozenCase`, which is exactly what `executeSkillRun` composes. Everything is exported, so no source change was needed.
  - It asserts every `PromptAssembly` field except `skills` and `user` is equal across the arms. Swapping or removing the `## Skills / rules` block makes the two user messages byte-identical, and the system messages are equal.
  - Both a no-other-skills and an other-skills carrier are covered. It also checks one structured call per arm on the snapshotted model, and that no live-context sections appear.
- **`/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/service-skill-run.test.ts`** (new, 14 tests, hermetic; in-memory repo stub, mock LLM, real service/arms/scoring/reviewer-core). I made it a separate file rather than extending `service.test.ts`, because that file's world guard forbids touching `container.llm`.
  - `startSkillRun` check order: 404 skill → 404 carrier → 422 `no_agent_linked` → 422 `no_eval_cases`, each beating the next, with nothing inserted and no LLM call.
  - A carrier linked only to another skill is `no_agent_linked`.
  - The run answers `{id, running}` before any review (gated LLM). The snapshot holds skill, carrier and both arms, and cases are read once.
  - NFR-2: exactly 4 provider calls for 2 cases, in the order with, without, with, without.
  - Finalize carries both arms' metrics, the raw lift and a completed status (a lift of null on precision when the without arm kept no finding).
  - EC-16 (partial), EC-17 (all errored, null metrics/lift/cost), EC-27 (null cost), NFR-12 (log lines carry no body, diff or prompt), and a crash mid-run still finalizes errored.
  - EC-24: after a deletion the run stops with no further LLM call, no write and no error log, whether deleted between arms, before the next case, before the first review, or during the last review.
- **`/Users/harlock/Downloads/Sites/devdigest/server/test/skill-eval-runs.it.test.ts`** (new, 25 tests, Docker). `eval.it.test.ts` is untouched.
  - 202 and run to completion with a mock that finds the bug only when the skill is in the prompt, so effects come out genuinely `helped` and `hurt`. It checks snapshot, case set, both arms, raw lift, cost over both arms, NFR-2 (4 calls) and NFR-4 (no writes to reviews, findings, agent_runs, agent_run_skills, run_traces, `last_reviewed_sha`).
  - AC-24/25 end to end: ties by name, an excluded link-off or skill-off skill, and the skill under test included in the with arm while itself disabled with its link off.
  - EC-16 partial, EC-17 errored.
  - 404 and 422 codes with nothing started, plus body and path validation.
  - 409 `eval_run_in_progress` with `details.run_id` per skill. A different skill's run is independent. EC-15 in both orders: a carrier's own agent run and the skill run proceed together, while the agent's own single-flight still holds.
  - EC-21/22: the snapshot survives a mid-run carrier and skill edit, and survives carrier deletion with the carrier name kept.
  - Overview: carriers by name with `enabled` and `link_enabled`, `latest`/`previous` are the two newest finished runs (errored and running excluded), chronological trend, `running_run_id`, null handling (EC-25/26/28), empty state, and trend capped at 100 with 105 seeded runs.
  - `GET /eval-runs/:id`: `owner_kind` skill versus agent.
  - `latest_result`: AC-40 list (both arms' states, effect, cost over both arms, null for a case not in the run, latest run wins). AC-59 detail (with-arm state, duration and cost summed over both arms, null cost in either arm gives null, null when no run or case not in it).
  - NFR-5: a newer finished skill run on the carrier never appears in agent overview, cases list, dashboard or compare, and compare 404s for any pair containing a skill run (EC-38).
  - EC-32: foreign skill, carrier and run are 404 and nothing changes.
  - EC-23 delete cascade (only its own), and EC-24 mid-run delete with a gated LLM (1 call, no run row left).
  - NFR-6: a finished run is deep-equal after its case is renamed, replaced and deleted.
  - NFR-1: read routes make no LLM call.
  - EC-18: boot reap marks a skill run errored with reason `interrupted`.
  - NFR-13: with 100 finished runs × 50 cases seeded directly via the DB, overview and the case list each answer in under 500 ms.
- **Client gaps (found while reading the new tests; EC-19/EC-20 were only covered at the hook level, not in the UI):**
  - `/Users/harlock/Downloads/Sites/devdigest/client/src/app/skills/_components/SkillEditor/_components/EvalsTab/_components/RunStatus/RunStatus.test.tsx` (new, 8 tests): AC-33 progress text, AC-34 polite final announcement incl. the partial count, EC-17 reason, EC-19 timeout message, EC-20 failed-poll message plus Retry calling `retry`, the idle live region, and `currentCaseNumber` / `finishedMessageKey`.
  - `/Users/harlock/Downloads/Sites/devdigest/client/src/app/skills/_components/SkillEditor/_components/EvalsTab/helpers.test.ts` (new, 6 tests): `liftParts` (NFR-9 signed points, computed from rounded arms rather than the raw diff, EC-26 em dashes, no-run dashes) and `passingCounts`.

### Run results
- `cd server && pnpm exec vitest run test/skill-eval-runs.it.test.ts` (Docker): pass, 25/25.
- `pnpm exec vitest run src/modules/eval` (whole eval folder, hermetic): pass, 180 tests in 11 files, including my 48 new hermetic tests.
- `./scripts/check.sh server typecheck`: pass. The first run caught one tuple-typing error in my stub, which I fixed.
- `./scripts/check.sh server lint <my 4 server files>`: pass.
- `./scripts/check.sh client related <2 new client files>`: pass, 14 tests.
- `./scripts/check.sh client typecheck` and client lint on the EvalsTab folder: pass.
- Re-ran the existing skill `EvalsTab.test.tsx`: pass, 14 tests.
- The existing `EvalsTab.test.tsx` logs `MISSING_MESSAGE ... prReview` noise. It comes from the implementers' test, which I left unchanged, and it is not a failure.
- I did not run the full `.it` suite, so the baseline failures in `state.json` were neither touched nor claimed.
- EC-24's "no error log" is asserted only in the hermetic service test (logger stub). The integration test cannot capture app logs.

### Implementation bugs found
None. Every assertion passed on the first run against the implementation.

### Seams I lacked
None. `buildArms`, `buildSkillRunSnapshot`, `armSnapshot` and `reviewFrozenCase` are exported and sufficient for the D7 parity test. The repo stub covers every repository method `startSkillRun` and `executeSkillRun` call.

### Out of scope
- `reviewer-core/` and `e2e/`: not covered by this agent.
- Trend chart (Phase C): not tested, as instructed.
- The client run-flow tests in `EvalsTab.test.tsx`, the hooks in `skill-eval.test.tsx` and the `contracts.test.ts` skill-run block were already covered by the implementers, so I did not duplicate them.