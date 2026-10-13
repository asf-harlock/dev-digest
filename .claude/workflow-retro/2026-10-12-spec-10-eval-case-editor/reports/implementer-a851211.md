## Hand-back 1

## Implementation report: SPEC-10 Phase A, W2-A server (steps A3–A10)

### Plan step → change
1. A3 — `server/src/modules/eval/repository.ts`, `types.ts`. `findingContext` now also selects `t.agents.name` and returns `agentName`. It is already left-joined and scoped by `workspace_id`, so no new query. The owners are composed in the service from `findingContext` (agent), `getCaseBySourceFinding` (agent `has_case`) and the existing `findingSkills` (skills, ordered by `agent_run_skills.order`, with `caseId`). `FindingCaseContext` gained `agentName: string | null`. (skills: onion-architecture, fastify-best-practices, zod, security, typescript-expert, drizzle-orm-patterns)
2. A4 — `helpers.ts`, `constants.ts`.
   - New pure helpers: `buildDraftName`, `toDraftOwners`, `toEvalCaseDraft`, `buildFindingInputMeta`.
   - New constants: `DRAFT_NAME_PREFIX` and `INVALID_CASE_INPUT_MESSAGE`.
3. A5 — `service.ts` `draftFromFinding`. Check order is 404, then `finding_undecided`, then `agent_missing` (only when there is no agent and no recorded skill), then `loadRawDiff` and `freezeFileDiff` for `no_patch` / `range_outside_diff`. It makes no LLM call. `type` comes from `accepted_at` / `dismissed_at`.
4. A6 — `service.ts` `createFromFinding(…, input?)` and `createFromFindingForSkill(…, input?)`.
   - With no input the behaviour is unchanged.
   - With input, `insertFindingCase` runs the validation shared with `createManualCase` (extracted into `freezeCaseInput`). It stores `source_finding_id`, `pr_number` / `repo_full_name` of the finding's PR, and the input's name and notes.
   - The agent `409` and the skill `200` / race fallback are kept.
5. A7 — `helpers.ts`.
   - `toLatestResult` returns `findings`, or `null` when the outcome has none.
   - `toSkillDetailLatest` returns `findings` from the with arm, plus `effect` from `classifyEffect(w, wo)`.
6. A8 — `routes.ts`.
   - New `GET /findings/:id/eval-case-draft` (`schema.params`, `response: {200: EvalCaseDraft}`).
   - `POST /findings/:id/eval-case` takes an optional body, parsed with `EvalCaseInput.safeParse(req.body ?? undefined)` and mapped to `ValidationError` (422). The comment cites the `server/INSIGHTS.md` 2026-09-20 exception.
   - `POST /findings/:id/skill-eval-case` keeps `schema.body` and passes `req.body.input`.
   - The header comment list is updated.
7. A9 — `service.test.ts`: only the `findingContext` fixture got `agentName: 'agent'`. No assertions changed, and `service-skill-run.test.ts` needed nothing.
8. A10 — `server/README.md`. The README had no eval section, so I added "Eval case routes from a finding (SPEC-10)" with a three-row route table covering the draft route and the optional input of both finding routes.

### Files changed
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/{routes,service,repository,helpers,constants,types}.ts`
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/service.test.ts` (fixture only)
- `/Users/harlock/Downloads/Sites/devdigest/server/README.md`
- No vendor, client or new test files.

### Tests run
Inner loop plus a few extras, since they were cheap:
- `./scripts/check.sh server typecheck` — PASS
- `./scripts/check.sh server related <changed files>` — PASS (178 passed on the first run, 101 on the re-run after the fixture edit)
- `./scripts/check.sh server lint` — PASS
- `./scripts/check.sh server arch` — PASS
- `./scripts/check.sh server test` — PASS (798 passed)
- `./scripts/check.sh core typecheck` — PASS
- No `*.it.test.ts` was run (no Docker). The draft route and the finding routes with input are not exercised against the DB yet; that is W4-A's `eval-draft.it.test.ts`.

### Self-check (implementation scope only)
- Diff matches the plan: yes, with the plan ambiguities below.
- Naming and "Do not touch" rules respected: yes. No vendor, migration or lockfile edits.
- i18n keys: n/a (server only).

### Deviations from plan
- none.

### Plan ambiguities / decisions for the caller
1. **Seeded name cut.**
   - The plan and UI-6 say "cut to 80 chars after the prefix". `EvalCaseInput.name` is `max(80)`, so a prefix plus an 80-character title would fail on Save.
   - I cut the whole name to 80 characters: `("From finding: " + title).slice(0, 80).trimEnd()`.
   - W4-A tests should assert a total of at most 80, not a title of 80 after the prefix. The spec table (line 90) says "at most 80 characters", which supports this reading.
2. **Expectation `title` is now persisted for manual cases too.** The shared `freezeCaseInput` stores `exp.title ?? null`, so `createManualCase` is a small behaviour change: zod used to strip `title` from the body, now it is kept. I left `updateCase` untouched, so a PATCH still keeps the stored title (`stored.title`) and a title edit via PATCH is ignored. If AC-25 should cover PATCH, that needs a follow-up decision.
3. **Optional body on `POST /findings/:id/eval-case`.** Only `undefined` / `null` counts as "no body". A posted `{}` is a 422, because `EvalCaseInput` rejects it. The client (W3-A) must send no body, not `{}`, for the no-input path.
4. **`agent_missing` vs EC-4 on the draft route.** The 422 fires only when `findingContext` yields no existing agent AND `findingSkills` is empty. If the agent is missing but skills exist, the owners list holds only those skills.
5. **`findings` / `effect` on the latest result.** Agent cases return `findings` (or `null`) and omit `effect`. Skill cases get `findings` from the with arm and `effect`. Phase A still reads from the newest finished set run.

### Handoff note
- **Architecture review:** `draftFromFinding` composes owners from three repository calls in the service. It does not use a single joined reader, which keeps the SQL unchanged. Fine to revisit if the reviewer prefers one reader.
- **Security review:** the new `ValidationError` carries zod `issues` as `details`, the same shape the global handler already returns. All lookups are workspace-scoped, and the existing `getCaseBySourceFinding` / `findingSkills` scoping is reused.
- **Before the Phase A commit:** run the DB-backed ITs (`pnpm exec vitest run .it.test`) with Docker to cover NFR-15 for `eval-cases`, `skill-eval` and the rest.

---

## Hand-back 2

## Fix mode: SPEC-10 Phase A, AC-25 / F1 (title edit dropped on a stored manual case)

Fixed. A PATCH that carries a changed expectation `title` now persists it for a manual case. Finding-sourced cases stay locked.

| Finding | Status | Change |
|---|---|---|
| AC-25 / F1 | fixed | `helpers.ts`: new pure `resolveExpectationTitle(edited, stored)`, which returns the edited title when the body carries one (`null` clears it) and the stored title otherwise. `classifyEdit` for a finding-sourced case now counts a title the body carries that differs from the stored one as a change, so it returns `locked`. A title the body omits is not a change. |
| | | `service.ts` `updateCase`: both `effectiveExpectation(…, stored.title)` calls (the in-place branch and the replace branch) now pass `resolveExpectationTitle(update.expectation?.title, stored.title)`. |

- **Edit kind:** a title-only edit on a manual case stays `in_place`. The case keeps its id and past results, and nothing is replaced. The title is not part of the match key, so scoring and matching are untouched.
- **Not changed:** the SPEC-09 AC-14/15 replace rule, `classifyEdit` for a case with no source finding, and the scoring and matching code.
- **Files:** only `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/helpers.ts` and `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/service.ts`. No new test files, and no fixtures needed changing.

Gates:
- `./scripts/check.sh server typecheck` — PASS
- `./scripts/check.sh server lint` — PASS
- `./scripts/check.sh server arch` — PASS
- `./scripts/check.sh server test` — PASS (798 passed) on the second run. The first run failed on `test/project-context.test.ts` NFR-2, a 2,000 ms timing assertion (it took about 2.7 s), which is unrelated to eval and did not repeat.
- `cd server && pnpm exec vitest run eval-cases skill-eval eval.it` (Docker up) — 5 files, 107 tests passed. That covers `eval-cases-race`, `skill-eval`, `eval-cases`, `eval.it` and `skill-eval-runs`.

Nothing in the existing tests exercises a title-only PATCH. The new behaviour (title edit persists on a manual case, a changed title is locked on a finding case) has no test yet, so W4-A should add one.

---

## Hand-back 3

## Fix mode: SPEC-10 Phase A, review-round-1 B2

| id | status | evidence |
|---|---|---|
| B2 | fixed | `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/service.ts`: `freezeCaseInput(input, finding?)` (~line 274) now passes the finding's `kind` to `freezePastedDiff` only when `exp.file`, `start_line` and `end_line` equal the finding's own. An edited location gets the strict hunk-intersection check. `insertFindingCase` with an input passes `ctx.finding` (~line 223). `createManualCase` passes no finding, so manual create stays byte for byte. `updateCase` calls `freezePastedDiff` directly and was not touched. |

**Gates**
- `./scripts/check.sh server typecheck` — PASS
- `./scripts/check.sh server lint` — PASS
- `./scripts/check.sh server arch` — PASS
- `./scripts/check.sh server test` — PASS (798 passed)
- `cd server && pnpm exec vitest run eval-cases skill-eval eval.it` (Docker up) — 5 files, 107 tests passed. That covers `eval-cases-race`, `skill-eval`, `eval-cases`, `eval.it` and `skill-eval-runs`.

No existing test was edited and no signature moved.

**Tests W4 should add**
- **Hermetic, `draft.test.ts` (or a service test):**
  - A `secret_leak` (or other full-file kind) finding whose lines miss every hunk. The draft route succeeds, and `createFromFinding` and `createFromFindingForSkill` with the unedited draft as input return 201 instead of `range_outside_diff`.
  - The same input with an edited `start_line` or `end_line`, or an edited file, outside the hunks returns 422 `range_outside_diff` (the strict check).
  - A plain `finding` kind with out-of-hunk lines stays 422.
- **DB-backed, `eval-draft.it.test.ts`:** the same three cases through both finding routes.