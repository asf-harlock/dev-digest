## Hand-back 1

## W1 report: SPEC-09 plan step A1 (contracts)

**Files changed** (the two copies are identical in the eval region; `git status` shows only these two):
- `/Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/knowledge.ts`
- `/Users/harlock/Downloads/Sites/devdigest/client/src/vendor/shared/contracts/knowledge.ts`

No edits to `contracts/index`/`index.ts`, `eval-ci.ts`, migrations or any other file. The barrel uses `export *`, so the new exports are picked up automatically.

**Changes (in both copies, inside `// ---- Eval ----` … `// ---- Memory ----`):**
- `EvalCaseMeta.pr_number` and `repo_full_name` are now `.nullish()`. `EvalCaseSource.pr_number` is `.nullish()`.
- `EvalCase.replaced_from_id` is `z.string().nullish()`.
- New `EvalExpectationInput`: `type`, `file` 1–500, `start_line` int ≥ 1, `end_line` int ≥ 1, `severity` as `Severity.nullish()`, `category` as `FindingCategory.nullish()`. `.refine(end_line >= start_line)` sits on this sub-object only, so `EvalCaseInput` stays a plain `ZodObject` and `.partial()` still works.
- New `EvalCaseInput`: `name` 1–80, `notes` ≤ 2000 nullish, `input_diff: z.string()` with no cap, `input_meta {title 1–200, body ≤ 5000 nullish}`, `expectation: EvalExpectationInput`.
- New `EvalCaseUpdate = EvalCaseInput.partial()`. A quick throwaway test (since removed) showed `{name}` parses, an `end_line` below `start_line` is rejected, and a valid full input parses.
- New `EvalCaseEffect` (5 values incl. `errored`), `EvalSkillCaseListItem` (`latest_result` nullable, `source_finding_id` nullable), `EvalFindingSkills`, `SkillEvalCaseRequest` (`skill_id: z.string().uuid()`).
- `EvalCaseRename` is kept unchanged because `server/src/modules/eval/routes.ts:8` and `:80` still use it. The server workstream can switch the PATCH body to `EvalCaseUpdate`.
- Outside the compared region, I added `import { Severity, FindingCategory } from './findings.js';` at the top of both files. `findings.ts` imports only zod, so there is no cycle.

**Gates run (inner loop only; the caller runs the outer loop):**
- `./scripts/check.sh server typecheck` — PASS
- `./scripts/check.sh client typecheck` — PASS
- `./scripts/check.sh core typecheck` — PASS
- `./scripts/check.sh server related <knowledge.ts, test/eval-contract-parity.test.ts>` — PASS (396 passed)
- `./scripts/check.sh client related <knowledge.ts>` — PASS (45 passed)
- `./scripts/check.sh server lint <knowledge.ts>` — PASS
- `cd server && pnpm exec vitest run test/eval-contract-parity.test.ts` — 5/5 passed

**Call sites affected by the nullish change.** Typecheck stays green in all three packages. Places that now see `number | null | undefined` and need a null-safe treatment:
- `server/src/modules/eval/service.ts:165` — `source: ... pr_number: row.inputMeta.pr_number`. This is typed `nullish` in `EvalCaseSource`, so it compiles. Manual cases with no PR will emit `null` or `undefined`.
- `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/CaseModal/_components/CaseBody/CaseBody.tsx:73-74` — builds the link `/repos/${repo_id}/pulls/${c.source.pr_number}` and the i18n `{number}` from `source.pr_number`. It compiles, but for a manual case this would render `/pulls/undefined` or `/pulls/null`. The client workstream should hide the link when `source` is null or `pr_number` is nullish.
- `server/src/modules/eval/helpers.ts:232` builds `EvalCaseMeta` and `server/src/db/schema/eval.ts:39` types the jsonb column. Both still compile. The server workstream must write null-safe values for manual cases.
- `client/.../EvalsTab.test.tsx:78,82` — test fixture only, still valid.

**Spec/plan mismatches:**
- The spec's Contracts block and plan A1 agree on every field I added. No conflicts.
- `EvalCaseUpdate` is "partial of `EvalCaseInput`", so an empty `{}` body parses. The spec says "every top-level key optional" and does not require at least one key. If the server should reject an empty PATCH, that is a service check.
- `SkillEvalRunRequest`, `EvalLift`, `EvalSkillRunRecord`, `EvalSkillTrendPoint`, `EvalSkillOverview`, the `EvalRunDetail` union and the `EvalTrendPoint.cost_usd` addition are Phase B (B1) and `eval-ci.ts`. I did not add them, per the "A1 only" scope.
- The existing `EvalExpectation` (the stored shape) keeps `severity` and `category` as `z.string().nullish()` and has no length or int bounds. Only the new input shape enforces `Severity`/`FindingCategory`, matching the spec's UI-9.