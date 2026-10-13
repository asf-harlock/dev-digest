## Hand-back 1

## Repository Research: what is removed or must change when SkillEvalMenu and the FindingCard `skillEval` prop are deleted

Searched with `git grep` across the whole repo (tracked files only). Paths below are relative to `/Users/harlock/Downloads/Sites/devdigest`.
FC = `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard`.

### Conclusion
- Deleting `SkillEvalMenu` and the `skillEval` prop is safe. Nothing outside the card uses them, and the one live caller is `FindingsPanel.tsx:138`.
- After the delete, `useFindingSkills` and `useCreateSkillCaseFromFinding` have no consumer except their own test, and the two server routes have no consumer in the app. They are dead code unless you remove them too.
- Nothing in `e2e/`, `mcp/`, `evals/` or `docs/` references any of these symbols.

### 1. Must be deleted or changed (client, direct)

| Item | Location | Action | Evidence |
|---|---|---|---|
| `SkillEvalMenu` component directory | `FC/_components/SkillEvalMenu/` (4 files: `SkillEvalMenu.tsx`, `styles.ts`, `index.ts`, `SkillEvalMenu.test.tsx`) | Delete the whole directory | `SkillEvalMenu.tsx:21` defines it. The only importer is `FindingCard.tsx:25`. |
| `SkillEvalMenu.test.tsx` | `FC/_components/SkillEvalMenu/SkillEvalMenu.test.tsx:1,10,57,70` | Deleted with the directory | It also asserts the `POST …/skill-eval-case` URL at `:113`. |
| `FindingCard` import | `FC/FindingCard.tsx:25` | Remove the import | `import { SkillEvalMenu } from "./_components/SkillEvalMenu";` |
| `FindingCard` destructured prop | `FC/FindingCard.tsx:38` | Remove | `skillEval,` |
| `FindingCard` prop type and doc comment | `FC/FindingCard.tsx:50-52` | Remove | `skillEval?: boolean;` with the `/** SPEC-09 … */` comment above it. |
| `FindingCard` render | `FC/FindingCard.tsx:129` | Remove | `{skillEval && <SkillEvalMenu finding={f} />}` |
| `FindingCard` header comment | `FC/FindingCard.tsx:2-5` | Reword | It mentions "(SPEC-08, SPEC-09) turn-into-eval-case and turn-into-skill-eval-case". |
| `FindingsPanel` usage | `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:138` | Remove the `skillEval` prop | `skillEval` is passed bare inside `<FindingCard …>`, right after `evalCase={evalCaseFor(f.id)}`. |
| `SKILL_REJECTION_KEY` | `FC/constants.ts:28-35` | Delete (comment plus const) | Only consumer is `SkillEvalMenu.tsx:9,146`. |
| `skillEvalsTabHref` | `FC/constants.ts:37-38` | Delete | Only consumer is `SkillEvalMenu.tsx:9,116`. |
| `SkillCaseRejection` import | `FC/constants.ts:2` | Delete | Only used by `SKILL_REJECTION_KEY`. |
| `skillMenuState` and `SkillMenuState` | `FC/helpers.ts:37-49` | Delete | Only consumer is `SkillEvalMenu.tsx:10,36`. |

Notes on the constants and helpers:
- Keep `EVAL_REJECTION_KEY`, `evalsTabHref` and `evalEvalButtonState`. They belong to `EvalCaseButton` (SPEC-08).
- The `evalCase.errors.*` keys in `prReview.json` are reused by `SKILL_REJECTION_KEY` (`constants.ts:31-33`) but must stay, because `EvalCaseButton` still uses them.

### 2. i18n

| Item | Location | Action |
|---|---|---|
| `prReview.skillEval.*` block | `client/messages/en/prReview.json:160-176` | Delete the block. Keys are: `turnInto`, `creating`, `enabledHint`, `undecidedTooltip`, `noSkillTooltip`, `loadingSkills`, `loadError`, `listLabel`, `pick`, `inEvalSet`, `inEvalSetLink`, `errors.skillNotInRun`. The preceding `evalCase` block ends with `},` at `:159`, so the trailing comma on that line must go. |
| Other locales | `git ls-files client/messages` lists only the `en/` directory | No other locale files exist. |
| Key-coverage test | `client/src/test/i18n-key-coverage.test.ts:27` | Remove `"app/repos/[repoId]/pulls/[number]/_components/FindingCard/_components/SkillEvalMenu"` from `ROOTS`. If left, `fs.statSync` at `:30` throws ENOENT once the directory is gone. |
| Same test, header comment | `i18n-key-coverage.test.ts:15` | Reword "and the finding-card skill menu". |
| Same test, thresholds | `i18n-key-coverage.test.ts:79-80` | Check `files.length > 20` and `uses.length > 80` still hold after the removal. I did not run it. |

The `skillEval.*` keys are used only in `SkillEvalMenu.tsx` (lines 41, 43, 83, 95, 105-146) and in `SKILL_REJECTION_KEY` (`constants.ts:34`).

### 3. Tests

| Test | Location | What happens |
|---|---|---|
| `SkillEvalMenu.test.tsx` | see section 1 | Deleted with the component. |
| `FindingCard.test.tsx` | `FC/FindingCard.test.tsx` | No change needed. A case-insensitive grep for "skill" found nothing in it. |
| `FindingsPanel.test.tsx` mock | `FindingsPanel/FindingsPanel.test.tsx:22-27` | Remove the `vi.mock("../../../../../../../lib/hooks/skill-eval", …)` block and its comment. The block mocks `useFindingSkills` (`:25`) and `useCreateSkillCaseFromFinding` (`:26`), and the comment says it is "setup only". |
| `client/INSIGHTS.md:90-95` | 2026-10-11 entry | Mentions `SkillEvalMenu`, the `FindingsPanel.test.tsx:24` mock and the `skillEval` opt-in prop. It is documentation, not code. Decide whether to amend or keep it as history. |

### 4. Are the hooks and server routes used elsewhere?

| Symbol | Definition | Other consumers | Verdict |
|---|---|---|---|
| `useFindingSkills` | `client/src/lib/hooks/skill-eval.ts:46-57` | Only `SkillEvalMenu.tsx:8,28`, `skill-eval.test.tsx:17,75,79`, and the mock at `FindingsPanel.test.tsx:25`. | Orphaned after the delete. |
| `useCreateSkillCaseFromFinding` | `skill-eval.ts:78-116` | Only `SkillEvalMenu.tsx:8,29`, `skill-eval.test.tsx:15,126,145`, and `FindingsPanel.test.tsx:26`. | Orphaned after the delete. |
| `SkillCaseRejection`, `CreateSkillCaseResult`, `SKILL_CASE_REJECTIONS` | `skill-eval.ts:59-76` | `SkillCaseRejection` is used in `constants.ts:2,30` and `SkillEvalMenu.tsx:8,31`. The other two appear only in `skill-eval.ts`. | Orphaned after the delete. |
| `evalKeys.findingSkills` / `findingSkillsAll` | `client/src/lib/hooks/eval.ts:44-45` | `findingSkillsAll` is invalidated at `eval.ts:187` (`useUpdateEvalCase`) and `:202` (`useDeleteEvalCase`). `eval.test.tsx:317` asserts the invalidation. | Becomes dead state. Removing it also means editing `eval.test.tsx:317`. |
| `EvalFindingSkills`, `SkillEvalCaseRequest` contracts | `client/src/vendor/shared/contracts/knowledge.ts:327-345` and `server/src/vendor/shared/contracts/knowledge.ts:327-345` | The server routes use them. The client uses them only in `skill-eval.ts:12,54,103`, `SkillEvalMenu.test.tsx:8,25,63` and `skill-eval.test.tsx`. | The shared copies must change in both vendor directories in the same commit, per the CLAUDE.md gotcha. |
| `GET /findings/:id/eval-skills` | `server/src/modules/eval/routes.ts:45,68-75`; service `listFindingSkills` at `service.ts:251`; repo `findingSkills` at `repository.ts:510` | Called only by `useFindingSkills` (`skill-eval.ts:54`). Also in `server/test/skill-eval.it.test.ts` (lines 13, 130, 187-238, 439, 446-456) and `service.test.ts:108,241`. | No other app consumer. `mcp/`, `e2e/`, `evals/` and `docs/` have no hits. |
| `POST /findings/:id/skill-eval-case` | `routes.ts:46,77-95`; service `createFromFindingForSkill` at `service.ts:123`; repo `findingSkills` also read at `service.ts:137` | Called only by `useCreateSkillCaseFromFinding` (`skill-eval.ts:90`). Also in `skill-eval.it.test.ts:178,248,348` and `service.test.ts:215-239`. | No other app consumer. |

### 5. e2e and other places

- **e2e:** no hits in `e2e/` for `skill-eval`, "Turn into skill", `skillEval.` or the routes. No e2e spec changes are needed.
- **`mcp/`, `reviewer-core/`, `docs/`, `server/README.md`, `client/CLAUDE.md`:** no hits.
- **`evals/src/ci-plan.ts:37,56` and `evals/src/ci/eval-plan.ts`:** a local variable `skillEvals` is unrelated to the prop. Do not touch it.
- **`specs/09-skill-evals.md`:** AC-48 to AC-53 (lines 172-176), the contract lines 346-347, and line 291 describe this feature. These are spec documents and will be out of date if the feature is removed.
- **`.claude/workflow-retro/2026-10-11-spec-09-skill-evals/metrics.json:3195`:** a historical log mention only.

### Could not determine
- I did not run `pnpm arch`, `pnpm typecheck` or the tests, so whether `i18n-key-coverage.test.ts:79-80` thresholds still pass after the removal is unverified.
- I did not check `.claude/` skills, agents or hooks beyond the grep hits above. The grep was repo-wide, so there are no other tracked hits.
- Untracked or git-ignored files were not searched.
- Only the `client/messages/en/` locale exists, so I could not check any other locale.