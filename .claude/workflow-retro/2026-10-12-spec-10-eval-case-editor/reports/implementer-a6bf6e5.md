## Hand-back 1

## W1-A (A1-A2) report

### What changed
Edited only inside the `// ---- Eval ----` region (up to `// ---- Memory ----`), with the same edits in both copies:
- `/Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/knowledge.ts`
- `/Users/harlock/Downloads/Sites/devdigest/client/src/vendor/shared/contracts/knowledge.ts`

The region was byte-identical before the edit. Both copies still match inside it, and I did not touch the drift outside it.

Changes:
- **`EvalExpectationInput`**: added `title: z.string().max(200).nullish()`.
- **`EvalCaseLatestResult`**: added `findings: z.array(EvalActualFinding).nullish()` and `effect: EvalCaseEffect.nullish()`. There is no `ran_at`.
- **Declaration order**: `EvalFindingLabel`, `EvalActualFinding` and `EvalCaseEffect` moved up so they sit before `EvalCaseLatestResult`. The old declarations are gone. `EvalFindingLabel` had to move with `EvalActualFinding`, which depends on it. A one-line pointer comment is left under the `Eval — per-case outcome` banner.
- **New `EvalCaseDraftOwner`** (helper): `{kind: EvalOwnerKind, id, name, has_case, case_id: string|null}`.
- **New `EvalCaseDraft`**: `{name, expectation: EvalExpectation, input_diff, input_meta: EvalCaseMeta, owners: EvalCaseDraftOwner[]}`. It sits just before `SkillEvalCaseRequest`.
- **`SkillEvalCaseRequest`**: added `input: EvalCaseInput.optional()`.
- No `.default()` anywhere.

### Gates
- `./scripts/check.sh server related src/vendor/shared/contracts/knowledge.ts test/eval-contract-parity.test.ts test/contracts.test.ts`: `PASS server:related 3s (486 passed (486))`.
- I also ran the two named tests directly: `eval-contract-parity.test.ts` 5 passed and `contracts.test.ts` 18 passed.
- `./scripts/check.sh server typecheck`: `PASS server:typecheck`.
- `./scripts/check.sh client typecheck`: `PASS client:typecheck`.
- `./scripts/check.sh core typecheck`: `PASS core:typecheck`.
- No downstream breakage appeared, because all new fields are `nullish` or `optional`.

### Plan ambiguities
- The plan says `EvalCaseDraft.expectation: EvalExpectation` (the stored shape, `title` nullish, no 200 cap). I followed that. The edited input goes through `EvalExpectationInput`.
- Owner field names `kind`/`id`/`name`/`has_case`/`case_id` follow the plan. The existing `EvalFindingSkills` uses `skill_id`, so W2 and W3 must map between the two shapes.
- I named the helper schema `EvalCaseDraftOwner` to satisfy the plan's "`Eval*`" rule, which the parity test's `Eval*` export check relies on.
- The `EvalCaseLatestResult` doc comment now mentions SPEC-10. It is a comment inside the region, identical in both copies.