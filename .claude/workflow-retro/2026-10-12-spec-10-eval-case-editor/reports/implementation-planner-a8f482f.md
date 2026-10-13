## Hand-back 1

## Requirements review: SPEC-10 Eval case modal from a finding, per-case Run, Evals tab redesign

### Source
`/Users/harlock/Downloads/Sites/devdigest/specs/10-eval-case-editor-run.md`. Status is **draft**: the user has not read it, so the Q-1..Q-14 defaults are unreviewed. Please ask whether to plan from a draft, or have `spec-creator` apply the amendments below first.

The file:line claims I checked all hold:
- `service.ts:282-291` and `326-329` read the case result from the single newest finished run.
- `EvalCaseButton.tsx:59-61`, `FindingCard.tsx:128-129`, `EvalsTab.tsx:76-85`, `Modal.tsx:60` and `EditorModal.tsx:164-175` match the spec.
- Both single-flight unique indexes (`eval_runs_one_running_agent_uq` / `_skill_uq`, `db/schema/eval.ts:115-120`) already cover any `scope`. EC-18 needs no new index and no code beyond the existing 409 mapping.

### Requirements as given (status)
Everything not listed is **Clear**: AC-1..5, 7..9, 10..12, 14..21, 25, 27, 28, 31, 33..37, 41, 42, 47, 50, EC-1..6, 9..12, 14..17, 19..21, 23..26, 29, 30, NFR-1..4, 6, 7, 9, 10, 12..16, UI-1, UI-3..11.

| # | Issue | Status |
|---|---|---|
| AC-6, EC-5 | AC-6 says `201`. The skill route returns `200` with the existing case when one exists (`routes.ts:77-95`, "201 \| 200"). The agent route gives 409 `eval_case_exists`. EC-5 must handle both. | Ambiguous |
| AC-13 vs AC-12 | Same case is editable and then read-only. Consistent only if "saved" flips it. Fine, but the Run-on-save "stay open on the saved case" transition must lock inputs. | Clear, noted |
| AC-26, EC-13 | `EvalCaseOutcome.findings` is already **required** in the stored contract (`knowledge.ts:384`). "Stored run predates the field" cannot occur. | Missing detail |
| AC-29 vs AC-39 | AC-29 lists the row for both tabs but has no **Run**. AC-39 puts **Run** on the agent tab only. Goals, US-3, AC-32 and AC-40 say both tabs. | Conflicting |
| AC-30 | Errored row text is not specified (EC-21 says only "errored state"). | Missing detail |
| AC-43 | "{passed}/{total} passed" is undefined for one case. No field carries it. | Ambiguous |
| AC-45 | **Run on save** with a skill-owned case has no carrier. The AC-40 dialog covers only **Run case** and the row **Run**. | Missing detail |
| AC-46, AC-43, EC-21 | "Newest **finished** run" is `completed \| partial` only (`service.ts:85`, `skillRuns()` uses `FINISHED`). A single errored case run is `status: errored` (`service.ts:500`). It would never surface in `latest_result`, so the errored banner and row state vanish on reload. | Conflicting |
| NFR-5 / AC-46 / AC-48 | NFR-5 says `latestFinishedRunRow` and the skill reader are set-only. But `listCases`, `getCase` and `listSkillCases` use those same readers for per-case results, which AC-46 needs from **any** scope. NFR-5 also omits `runningRunId` and `runningSkillRunId`. They feed the overview (AC-48: set-only) and the 409 `details.run_id` (EC-18: any scope), so each needs two variants. | Ambiguous |
| EC-7, UI-2 | A server-side "10,000 UTF-8 bytes before parsing" check does not fit. The server receives an object, not text. Zod caps (file ≤ 500, title ≤ 200) already bound it far below 10 KB. | Infeasible as stated, not testable |
| AC-11, Q-13 vs removal checklist | The checklist says to drop the `lib/hooks/skill-eval` mock in `FindingsPanel.test.tsx`. But AC-11 has the card call `useFindingSkills` from that module. Without the mock the test throws "No QueryClient set" (`client/INSIGHTS.md` 2026-10-11). | Conflicting |
| AC-40 and the shared Case Editor | The carrier dialog `RunDialog` lives in `app/skills/_components/SkillEditor/_components/RunDialog`. The shared `components/eval-case-editor` may not import a route's `_components/`, and shared code may not contain its own `_components/` (`client/CLAUDE.md`, `client/INSIGHTS.md` 2026-10-11). It must move to `src/components/`. The spec is silent. | Infeasible as stated |
| AC-24, AC-23, NFR-11 | "No scrollbar at 1280×720 and 768×600" cannot be asserted in jsdom. e2e flows must trigger no model call and use read-only seed data. | Ambiguous testability |
| EC-27 | A case run has one review (two for a skill case). "Before the next review" only applies between the arms. | Ambiguous, non-blocking |

### Contract coverage
Real contracts live in `knowledge.ts` (case side) and `eval-ci.ts` (runs), not an `eval.ts`. `server/test/eval-contract-parity.test.ts` compares only two marked regions byte for byte:
- the region from `// ---- Eval ----` to `// ---- Memory ----` in `knowledge.ts`;
- the region from the "Eval — runs…(SPEC-08)" banner to the "Compose Review" banner in `eval-ci.ts`.

It also asserts that the set of `Eval*` exports is equal. Every new type must sit inside a region and start with `Eval`.

| Value | Field | Stored in | Gap |
|---|---|---|---|
| Draft seed + owners (AC-2/3) | `EvalCaseDraft` (new, `knowledge.ts` region) | computed, no storage | none |
| Expectation `title` | `EvalExpectationInput.title` — missing today (the field is stripped by Zod). Already in stored `EvalExpectation`. | jsonb | none, add `.nullish()` |
| `findings` on the case result (AC-22/26) | `EvalCaseLatestResult.findings` — already stored in `case_results[].findings`. Skill with-arm read through `toSkillDetailLatest`. | jsonb | none (see Q8) |
| `effect` on the case result (AC-44) | `EvalCaseLatestResult.effect` — new nullish; skill case list has it already | derived | none |
| `ran_at` | no AC consumes it | — | Q8: drop |
| `scope` (AC-36/50) | `EvalRunScope` plus on `EvalRunRecord`, `EvalAgentRunDetail`, `EvalSkillRunRecord`, `EvalSkillRunDetail` | new column `eval_runs.scope` → migration `0025_*` | required field, no nullish needed (column, not jsonb) |
| `running_case_run {run_id, case_id}` | `EvalOverview`, `EvalSkillOverview` | derived from `case_set[0].case_id` of the running case run | none |
| 409 `details.run_id` | key name given in EC-18 | — | none |
| `EvalFindingSkills` (card state, AC-11) | exists; the agent's own case comes from `GET /pulls/:id/eval-case-links` | — | none |
| Skill finding route `input?` | extend `SkillEvalCaseRequest` with `input: EvalCaseInput.optional()` | — | none |
| Run-route body | `{carrier_agent_id}` optional → hand-parse (the `reviews/routes.ts:36` precedent, `server/INSIGHTS.md` ~line 156) | — | none |
| Passed/total in banner (AC-43) | no field; derive from `state` | — | Q6 |

Both finding routes: only `POST /findings/:id/eval-case` and `POST /eval-cases/:id/run` need hand-parsed optional bodies. The skill route always has a body and keeps `schema.body`.

### Clarifying questions (default in brackets)
1. **[AC-46, AC-43, EC-21, blocking]** Errored case runs are not "finished", so the banner and row would lose them on reload. Should the per-case reader take the newest non-running run containing the case, including `errored` for `scope='case'`? Set-scope readers stay unchanged. [Yes. Reword AC-46 to "newest completed, partial, or errored case-scope run, or finished set run".]
2. **[AC-39, blocking]** Make the row **Run** exist on both tabs, as Goals, US-3, AC-32 and AC-40 intend? [Yes, amend AC-39 to "either Evals tab".]
3. **[AC-45, blocking]** For **Run on save** with a skill-owned case, should the carrier dialog open after a successful save? [Yes. Cancelling leaves the case saved with no run. EC-19 and EC-20 apply, and **Run on save** is disabled when no carrier exists.] Needs one new AC.
4. **[AC-6, EC-5, blocking]** The skill route returns `200` for an existing case, while the agent route returns 409. [Keep the server as is. The client treats 200 and 409 both as EC-5. Reword AC-6 to "201, or 200 when it already exists".]
5. **[NFR-5, AC-48, blocking]** Confirm that NFR-5 gets two amendments:
   - the two running-run readers get set-only variants for the overview, while the 409 path keeps any-scope;
   - the case readers (`listCases`, `getCase`, `listSkillCases`) use a **new any-scope per-case reader**. It merges the newest set run with newer case runs of that case, bounded and with no unbounded jsonb scan.
   [Yes.]
6. **[AC-43]** For one case, is "{passed}/{total} passed" 1/1 or 0/1 from `state`, with the count omitted when errored? [Yes, client-derived, no new field.]
7. **[EC-7, UI-2]** Drop the server-side 10 KB clause and keep the client-only text cap? The server relies on the Zod field caps. [Yes. Otherwise a test cannot construct the 422.]
8. **[AC-26, EC-13]** Keep `findings` as `.nullish()` anyway and test with an outcome fixture lacking it? Drop `ran_at` from the contract because nothing consumes it? [Yes, both.]
9. **[Removal checklist, Q-13]** Keep a retargeted `vi.mock('lib/hooks/skill-eval')` in `FindingsPanel.test.tsx`, because the card still calls `useFindingSkills`? Fix the checklist and NFR-16 wording accordingly. [Yes.]
10. **[AC-40]** Move `RunDialog` (with its helpers) to `src/components/<carrier-run-dialog>/`, with the skill tab importing it from there? [Yes, a pure move with no behaviour change.]
11. **[NFR-11, AC-24, non-blocking]** Verify layout by unit-asserting the styles (`min-height:0`, `overflow:hidden` on the body and columns, each pane scrolling inside itself), plus a recorded manual browser check at both viewports. No e2e flow, since a flow cannot trigger a model call. [Yes.]
12. **[Migration, non-blocking]** The spec records consent for `0025_*` from `pnpm db:generate` and for editing both vendor copies. The user has not read the spec, so confirm at approval. Both are on the "Do not touch" list.
13. **[Execution mode]** Single-agent or multi-agent? See Recommendation below.

### Recommendations
1. **Phasing** — each phase is one commit that edits both vendor copies. Contract changes per phase:
   - Phase A: `EvalCaseDraft`, `EvalExpectationInput.title`, `EvalCaseLatestResult.findings` / `effect`, and `input?` on the skill request.
   - Phase B: `EvalRunScope` plus the 4 `scope` fields and `running_case_run`. This is several types, so it earns its own contracts workstream.
   Cost: none.
2. **Reuse the set executor.** Call `startRun` / `startSkillRun` with `caseSet=[one]` and a `scope` parameter, rather than a second path. This satisfies NFR-2/3 and keeps the boot reaper, `saveProgress`, `finalizeRun` and `deleteBy*` unfiltered, as NFR-5 says.
3. **Centralise the filter.** Add `scope='set'` inside `agentRuns()` and `skillRuns()` (`repository.ts:1012-1030`), plus `recentRunSummaries` (`:766`), the dashboard and trend readers, and `compare` (404 via `getRunRow`'s scope for EC-28). One predicate edit protects `server/INSIGHTS.md` 2026-10-11's "nothing but discipline" hazard.
4. **NFR-5 regression test.** The spec asks for one DB-backed test. I would make it enumerate every repo reader. It runs a set run, snapshots all of them, finishes a case run, and re-snapshots. Add it to `verify:l06`.
5. **`verify:l06` list.** It currently names only `scoring`, `frozen-input`, `executor`, `eval-contract-parity`, `contracts` and `eval.it.test.ts` (`server/package.json:17`). Add `test/eval-case-run.it.test.ts` (new), plus hermetic tests: draft seed, scope filters, Expected-output parser (client `helpers.test.ts`, run by client gates, not `verify:l06`). NFR-15 is covered by `pnpm test` plus the existing `eval-cases`, `skill-eval` and `skill-eval-runs` ITs, none of which are in `verify:l06`.
6. **i18n coverage.** Remove the `SkillEvalMenu` root. Add the new `EvalCaseButton` and `components/eval-case-editor` additions and `components/<carrier-run-dialog>` as roots. Re-check `files.length > 20` and `uses.length > 80`.
7. **Phase A has no run UI.** Ship an empty banner slot only. The footer toggle, **Run case** and the row **Run** arrive in B (AC-33..45).

### Skills (routing.json)

| Path / area | Bucket | Skills |
|---|---|---|
| `server/src/vendor/shared/contracts/*` and `client/src/vendor/shared/contracts/*` | contracts | zod, typescript-expert |
| `server/src/db/schema/eval.ts` | db-schema | drizzle-orm-patterns, postgresql-table-design, onion-architecture |
| `server/src/db/migrations/0025_*` (generated) | db-migrations | drizzle-orm-patterns, postgresql-table-design |
| `server/src/modules/eval/{routes,service,helpers,types,constants,executor}.ts`, `server/test/*` | backend | onion-architecture, fastify-best-practices, zod, security, typescript-expert |
| `server/src/modules/eval/repository.ts` | backend + conditional | the above + drizzle-orm-patterns |
| `server/package.json` (verify:l06) | deps | security |
| `client/src/{app,components,lib,test}/**`, `client/messages/**` | frontend | frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert |
| `client/**/*.test.tsx` | frontend + conditional | the above + react-testing-library |

Gates:
- `server:typecheck`, `server:lint`, `server:arch`, `server:test-unit`, `pnpm verify:l06`.
- `client:typecheck`, `client:lint`, `client:arch`, `client:test`.
- The `*.it.test.ts` files need Docker.
- Both vendor dirs are touched, so `core:typecheck` also applies (`reviewer-core` reads the server copy).

### Execution mode
Recommendation: **multi-agent, phases run sequentially, each ending green with its own commit.** Per phase: W1 contracts (both vendor copies; Phase B also schema and migration) → W2 server ∥ W3 client → W4 test-writer → architecture-reviewer ∥ security-reviewer ∥ plan-verifier.

The server and client file sets are disjoint once the contract lands:
- Phase A server: the draft route, optional input on both finding routes, `latest_result.findings`.
- Phase B server: scope filters, the run route, `running_case_run`, `409`.
- Client: the Case Editor rewrite, owner picker, Evals tabs, `SkillEvalMenu` removal, `RunDialog` move.

A single-agent pass would hold a very large context across both modules. If you prefer fewer launches, the fallback is one implementer per phase.

Awaiting answers to Q1..Q13 and the draft-vs-approved decision before writing the plan to `.claude/sdd/SPEC-10/plan.md`.

---

## Hand-back 2

The Phase 2 plan is written to `/Users/harlock/Downloads/Sites/devdigest/.claude/sdd/SPEC-10/plan.md`. I re-read the amended spec (AC-51, EC-31, NFR-17..20 included). The traceability table maps every AC, EC, NFR and UI id to a phase, workstream and step. It lists gates per package and a skills-per-file table from `routing.json`. Nothing has been executed; the user launches it with `/run-plan`.

**Shape**
- Multi-agent, phase A then phase B, each phase one commit that contains both vendor copies.
- Workstreams per phase: W1 contracts, then W2 server in parallel with W3 client, then W4 test-writer, then architecture-reviewer, security-reviewer and plan-verifier in parallel. No file is in two workstreams of the same phase.

**Phase A**
- Steps A1–A22.
- Contracts go in `knowledge.ts` only. They are `EvalCaseDraft`, `title` on `EvalExpectationInput`, `findings` and `effect` on `EvalCaseLatestResult`, and `input?` on `SkillEvalCaseRequest`. The parity test runs right after.
- Server: draft route, optional input on both finding routes, and `findings`/`effect` mapping.
- Client: Case Editor rewrite, `EvalCaseButton`, `SkillEvalMenu` removal per the spec checklist, both Evals tabs.
- Two Phase A moves the spec does not list: `EvalKpiCards` is route-private, so it moves to `client/src/components/eval-kpi-cards/`; otherwise the skill tab (AC-31) would break the arch rule.
- The i18n coverage roots and thresholds are updated in Phase A.
- Manual browser check A22.

**Phase B**
- Steps B1–B20.
- W1 does contracts in `eval-ci.ts`, the `scope` column, then the migration in its own step via `pnpm db:generate` only. The generated SQL should be the add-column alone.
- Server steps:
  - `scope='set'` applied in `agentRuns()` and `skillRuns()`, `recentRunSummaries` and the dashboard readers;
  - set-only running readers, with the any-scope lookup kept for the 409;
  - a new any-scope per-case reader;
  - `startCaseRun` on the existing executor with a `scope` parameter and a one-case set;
  - `POST /eval-cases/:id/run`;
  - compare returns 404 for a case run.
- Client steps:
  - `RunDialog` moves to `components/carrier-run-dialog/`;
  - hooks and polling;
  - footer toggle, **Run case**, result banner and **Run on save**;
  - row **Run** on both tabs;
  - disable-while-running.
- Manual check B20.

**Tests and gates**
- Server: typecheck, lint, arch, hermetic tests, `verify:l06` with the new files added, the parity test, and the full IT suite.
- Client: typecheck, lint, arch, test.
- `reviewer-core`: `npm run typecheck`.
- New server test files:
  - Phase A: `draft.test.ts` and `test/eval-draft.it.test.ts`.
  - Phase B: `case-run.test.ts` and `test/eval-case-run.it.test.ts` (the NFR-18 snapshot test).
- `verify:l06` gets script-text edits only.

**Manual check caveat:** the agent id `abf664e6…` is absent from the local DB. The verifier must use seeded PR #482 and its seeded findings, accept or dismiss one first, and may need a hand-inserted `agent_run_skills` row for the skill owner path. A real run needs a provider key; without one the run ends `errored`, which still exercises the errored banner.

**Risks recorded in the plan**
- NFR-8 lists client tests (the parser, the row result text) as `verify:l06` files, but that script is a server vitest run. I planned them under `client pnpm test` and flagged it for plan-verifier or `spec-creator`.
- The required `scope` field will force fixture edits in existing server and client tests. Assertions stay untouched.
- If the NFR-17 per-case query proves too heavy, the fallback of a separate `eval_case_runs` table is a requirement change, not something to switch to silently.
- The skill case-run status mapping must reduce to `completed` or `errored` without changing set-run behaviour.
- The i18n coverage thresholds are re-checked twice, once per phase.
- The `FindingsPanel` mock is retargeted to `useFindingSkills`; the `client/INSIGHTS.md` entry is left for the `engineering-insights` skill.