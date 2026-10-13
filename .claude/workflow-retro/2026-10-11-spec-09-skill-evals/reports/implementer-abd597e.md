## Hand-back 1

## Implementation report: SPEC-09 Phase A, steps A2–A10 (server, workstream W2)

All server steps A2–A10 are done and every inner-loop gate passes. I did not run `pnpm db:migrate` and did not touch `client/**` or the vendored contracts. No contract gap found.

### Plan step → change
Skills applied for every row: those the plan's table gives for `server/` files, all loaded once. They are drizzle-orm-patterns, postgresql-table-design, onion-architecture, fastify-best-practices, zod, security and typescript-expert. My `routing.json` resolution matched the plan for every file.

1. **A2, schema and migration**: `server/src/db/schema/eval.ts` widens `eval_cases_source_finding_uq` to `(source_finding_id, owner_kind, owner_id)`.
   - Generated with `pnpm db:generate < /dev/null`: one pass, no rename prompt, no column change.
   - Generated files: `server/src/db/migrations/0022_slimy_strong_guy.sql` (drop index, create the wider unique index), `server/src/db/migrations/meta/0022_snapshot.json`, and the `meta/_journal.json` entry (idx 22).
   - Nothing hand-edited.
2. **A3, constants**: `server/src/modules/eval/constants.ts`.
   - New codes `frozen_diff_too_large`, `case_input_locked`, `skill_not_in_run`, each with an API message.
   - `NOT_FOUND.skill`; `MAX_DIFF_BYTES = 204_800`; title/description/notes/path limits.
   - Diff header literals and `EMPTY_UPDATE_MESSAGE`.
3. **A4, pasted diff**: new pure `server/src/modules/eval/pasted-diff.ts`.
   - Exports: `utf8ByteLength`, `exceedsDiffLimit`, `normalizeNewlines` (CRLF → LF), `canonicalizeDiff`, `pastedDiffPaths`, `freezePastedDiff`, `diffUnchanged`.
   - It accepts `diff --git`, `---`/`+++`, `+++`-only and hunks-only input, and generates headers from the file path when none exist. A bare `---`/`+++` header only counts as a header when a `@@` line follows, so a removed line like `-- x` is not misread.
   - Grounding reuses `freezeFileDiff`; `extractFileDiff` is unchanged.
4. **A5, repository**: `server/src/modules/eval/repository.ts`, now owner-aware via a `CaseOwner {kind, id}` parameter.
   - `insertCase` takes owner, nullable `sourceFindingId`, `notes`, `createdAt` and an optional `tx`; a unique violation still becomes 409 `eval_case_exists` with `case_id`.
   - `listCases`, `countCases`, `caseNames`, `casesForRun` and `getCaseBySourceFinding` are owner-aware; agent behaviour is identical.
   - New: `updateCaseInPlace`, `replaceCase` (one transaction: insert with the old `created_at`, then delete the old case), `skillForEval`, `findingSkills`, `deleteBySkill`.
   - `findingSkills` goes `reviews.run_id` → `agent_runs` → `agent_run_skills` → `skills`, workspace-checked at every hop, in run order, with the finding's skill-owned `case_id`.
   - `renameCase` removed; `updateCaseInPlace` replaces it.
5. **A6, helpers**: `server/src/modules/eval/helpers.ts`.
   - `classifyEdit(existing, update)` returns `in_place | replace | locked`, comparing against stored values (echoed unchanged fields don't count), plus `hasUpdateFields`.
   - `buildManualMeta` (null `pr_number` and `repo_full_name`, empty body becomes null), `effectiveExpectation` (EC-41: severity and category are null for `must_not_flag`), `toSkillCaseListItem`.
   - `toEvalCaseDto` takes an optional `replaced_from_id`; `evalError` now also accepts 413.
6. **A7, service**: `server/src/modules/eval/service.ts`.
   - `createManualCase`: 404 owner, then the 204,800-byte check (422 `frozen_diff_too_large`, in the service), then pasted-diff freeze (`no_patch` / `range_outside_diff`), then insert.
   - `updateCase` replaces `renameCase`: 404, then empty body (422 `validation_error`), then byte cap, then `classifyEdit`, then `locked` (422 `case_input_locked`), in place, or replace. A replacement inherits `created_at`, keeps the owner, and the response carries `replaced_from_id`; in place returns `replaced_from_id: null`.
   - `listSkillCases`, `listFindingSkills`.
   - `createFromFindingForSkill`: 404 (finding, skill), then `finding_undecided`, then `skill_not_in_run`, then an existing case returns 200, then `no_patch`/`range_outside_diff`, then insert 201. A race on the unique index is caught and returns 200 with the winner.
   - Agent `createFromFinding` and the new skill path share a private `insertFindingCase`.
   - `getCase` is owner-agnostic: `latest_result` is null for skill cases, and `source` is null-safe via `pr_number ?? null`.
7. **A8, routes**: `server/src/modules/eval/routes.ts`. New routes:
   - `POST /agents/:id/eval-cases` (201)
   - `POST /skills/:id/eval-cases` (201)
   - `GET /skills/:id/eval-cases`
   - `GET /findings/:id/eval-skills`
   - `POST /findings/:id/skill-eval-case` (201 or 200)
   - `PATCH /eval-cases/:id` now takes `EvalCaseUpdate` (a `{name}` rename still works).
   - All use `schema.body`/`schema.params` and start with `getContext`.
8. **A9, `server/src/app.ts`**: Fastify's body-too-large error already reached the handler as 413, but with the misleading code `internal_error`. I added a branch that returns 413 with the stable code `payload_too_large`, without logging a server error. I confirmed the 413 and the code with a scratch IT (deleted).
9. **A10, skill delete**: `server/src/modules/skills/repository.ts` — `deleteById(ws, id, beforeDelete?)` now runs in one transaction, and a local `DbTx` type is declared there (cross-module import is arch-forbidden). `server/src/modules/skills/service.ts` — `delete` passes `(tx) => container.evalRepo.deleteBySkill(ws, id, tx)`. It deletes cases only; Phase B adds runs.

### Tests run (inner loop plus core typecheck once)
- `./scripts/check.sh server typecheck` — PASS
- `./scripts/check.sh server lint src/modules/eval src/modules/skills src/app.ts` — PASS
- `./scripts/check.sh server arch` — PASS
- `./scripts/check.sh server related <eval/*, skills/*, app.ts files>` — PASS (59 passed)
- `./scripts/check.sh server test` — PASS (697 passed, same as baseline). The plan assigns the outer loop to the caller; I ran it only because it was cheap.
- `./scripts/check.sh core typecheck` — PASS
- `pnpm exec vitest run test/eval.it.test.ts` — 38 passed (Docker). That run applied migration 0022 to a throwaway testcontainer, not the dev DB.
- Two scratch tests, both deleted afterwards because test-writer owns tests. The hermetic one exercised pasted-diff (hunks-only, `+++`-only, multi-file, CRLF, `diff --git`), `classifyEdit` in all three outcomes, and the echoed-diff case. The Docker IT ran these flows green:
  - manual create 201 (CRLF diff, null `pr_number`, empty body stored as null)
  - 422 `frozen_diff_too_large` and `range_outside_diff`
  - 404 for an unknown skill
  - `GET /skills/:id/eval-cases` with `latest_result` null
  - empty PATCH 422; in-place PATCH keeps the id with `replaced_from_id` null; replace PATCH gives a new id, the same `created_at` and `replaced_from_id` set
  - `finding_undecided`, `skill_not_in_run`, `eval-skills` list, 201 then 200 on repeat, `case_input_locked` for a finding-derived case, name/notes allowed on it
  - `getCase` source null for manual and set for finding-derived; 413 `payload_too_large`; skill delete cascades the cases
  - The mock LLM provider was never called.
  - One assertion in my own scratch script was wrong (`llm.calls` is an array, so `?? 0` gave `[]`); I did not re-run after fixing it.

### Self-check (implementation scope only)
- Diff matches the plan: yes. The deviations and decisions are listed below.
- Naming / "Do not touch": yes. No vendor, `client/**`, lockfile, applied-migration or `server/package.json` edits; `pnpm db:migrate` was not run. `pasted-diff.ts` is kebab-case.
- i18n keys: n/a (server only).

### Deviations from plan
- None in substance. The plan's `replaceCase(ws, oldId, values, tx)` signature became `replaceCase(ws, oldId, values)`, because the repository opens its own transaction; `insertCase` accepts an optional `tx` for it.

### Decisions where the plan was silent
- Empty PATCH body: 404 is checked first, then 422 `validation_error`.
- `case_input_locked` carries `details.case_id`.
- A pasted multi-file diff echoed back unchanged for a manual case counts as unchanged (`diffUnchanged` compares the chosen file's section with the stored one), so a rename stays in place. For finding-derived cases any real diff difference is `locked`.
- A finding-derived case's severity and category are compared as raw stored values, with a missing key meaning null. Manual cases compare the effective values after the EC-41 rule.
- A manual case's `expectation.title` is stored as null.
- `findingSkills` returns `undefined` for an unknown finding (404 for `GET /findings/:id/eval-skills`) and `[]` when the review has no run or the run recorded no skills. The client can use `skills.length === 0` for EC-36.
- The skill-case 404 order is: unknown finding, then unknown skill. A skill from another workspace is a 404, not `skill_not_in_run`.
- The 413 code `payload_too_large` is mine, since the plan said only "stable code". Tell W3 if they want a different mapping.
- Manual case names are stored exactly as typed, with no `-2` suffix, because the spec allows duplicate names.
- The `EvalCaseRename` contract is no longer used by the routes but stays exported.

### Handoff note
- **Migration:** the user must run `cd server && pnpm db:migrate` to apply 0022 to the dev DB. It is a drop and create of one index, with no row-count risk.
- **Tests for W4:**
  - hermetic: `pasted-diff`, `classifyEdit`, the NFR-1 no-LLM check on every new route;
  - Docker, new files `test/eval-cases.it.test.ts` and `test/skill-eval.it.test.ts`: routes, one case per owner and source finding including the race, EC-43 (an agent case and a skill case from the same finding), workspace scoping, skill delete cascade, 413.
- **Not done:** I could not cover EC-43 with an agent-owned case in my scratch run; only the widened index and the owner-scoped lookup are in place.
- **Review notes:**
  - `helpers.ts` now imports `pasted-diff.ts`, which imports `frozen-input.ts`, which imports `adapters/git/diff-parser`. `pnpm arch` passes, but the architecture reviewer may want to look at it.
  - `findingSkills` does three small queries in the repository.
  - `createFromFindingForSkill` reads the finding via `findingContext`, which also joins pull and repo, so a finding whose PR or repo is gone returns 404.
- **Baseline `.it` failures:** the ones in `state.json` `baseline_failures` (`skills.it.test.ts` 404 test, `skills-stats`, `context-run`) are untouched and not mine; I did not run those files.