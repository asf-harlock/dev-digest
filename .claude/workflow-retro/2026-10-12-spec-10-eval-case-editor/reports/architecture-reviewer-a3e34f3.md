## Hand-back 1

## Architecture review: SPEC-10 Phase A (A1-A18), `server/src/modules/eval/`, `client/`, both `vendor/shared` copies

Zero findings. Both `pnpm arch` runs pass and the prose rules I checked by hand are respected. Phase B was ignored.

### Deterministic check results
- `cd server && pnpm arch` ran on the working tree, which contains the whole Phase A change, so it does cover this diff. Result: `no dependency violations found (238 modules, 851 dependencies cruised)`.
- `cd client && pnpm arch` ran the same way. Result: `no dependency violations found (781 modules, 2495 dependencies cruised)`. Its rules are `shared-does-not-import-app`, `vendor-is-self-contained`, `no-private-component-from-outside-app`, `no-cross-route-private-component` and `no-circular`.
- The following have no machine gate, so I checked them by reading the diff against the prose rules (all passed):
  - onion rules 2, 5 and 6 and the "literal → `constants.ts`" placement rule
  - the client "component is a folder" convention
  - the `fetch` ban (enforced by eslint, not by `pnpm arch`)
  - the `vendor/ui` boundary
  - the mirrored `vendor/shared` copies

### Findings
| Gate | Severity | File:Line | Rule | Rationale | Suggestion |
|---|---|---|---|---|---|
| none | none | n/a | n/a | No boundary violation found. | n/a |

### Grounding note
Every point below was checked against the diff text and was clean. Only the two `pnpm arch` results above come from a tool.

**Server, `modules/eval/`**
- **Persistence (onion rule 2, `[House]`):** `service.ts` and `helpers.ts` import no `drizzle-orm`, no `db/schema` and no `fastify`. The one new query column, `agentName: t.agents.name`, is added only in `repository.ts` (about line 231). `service.draftFromFinding` calls only `this.repo.findingContext`, `getCaseBySourceFinding` and `findingSkills`.
- **Literals (placement rule 4):** The new literals, `DRAFT_NAME_PREFIX = 'From finding: '` and `INVALID_CASE_INPUT_MESSAGE`, live in `constants.ts`. `buildDraftName` in `helpers.ts` uses `CASE_NAME_MAX`, which already existed. The `kind: 'agent'` and `'skill'` strings in `helpers.ts` and `service.ts` are enum values, not limits or messages.
- **Pure core (onion rule 5):** The new helpers `toDraftOwners`, `toEvalCaseDraft`, `buildFindingInputMeta`, `resolveExpectationTitle`, `findingsOf` and the `classifyEdit` change are pure. They do no I/O and take no `container`.
- **Hand-parsing exception (onion rule 6, `[House]`):** `routes.ts` has `EvalCaseInput.safeParse(req.body ?? undefined)`. This is the optional-body exception, and the route comment cites `server/INSIGHTS.md` 2026-09-20. I read that entry: it covers a POST whose body may be entirely absent, with `reviews/routes.ts` as precedent. It exists and applies here. A malformed body becomes `ValidationError` (422). The new `GET /findings/:id/eval-case-draft` uses `schema.params` and `schema.response`, and the `skill-eval-case` route takes `input` through the shared `SkillEvalCaseRequest` schema.
- **Slices (onion rule 10, `[Convention]`):** No new cross-module import.

**Client**
- **Component folders:** The new `src/components/eval-kpi-cards/` has `EvalKpiCards.tsx`, `helpers.ts`, `index.ts` and `styles.ts`. It was moved out of the route-private `EvalsTab/_components/EvalKpiCards/` because two routes now use it: the agent EvalsTab and the skill EvalsTab. That matches "used by two or more features → promote to `src/components/`". The new `TypeBanner`, `OwnerPicker`, `InputTabs`, `ExpectedOutputPane` and `ActualOutputPane` are folders under `src/components/eval-case-editor/`, with a mandatory `.tsx` and `index.ts` plus helpers, styles or constants as needed. `find src/components -name _components` returns nothing.
- **Hook placement:** The new hook `eval-case-editor/use-narrow-viewport.ts` sits beside the existing `use-escape-key.ts`. It keeps its literal in `constants.ts` as `NARROW_QUERY`. `client/docs/component-conventions.md` has no hook-file rule, so I found nothing to cite against it.
- **Route imports:** New route code imports only from `@/components/eval-case-editor`, `@/components/eval-kpi-cards`, `@/lib/hooks/*` and its own folder (e.g. `EvalCaseButton.tsx` imports `../../constants` and `../../helpers`). Nothing under `src/components/` or `src/lib/` imports from `@/app`. The deleted `SkillEvalMenu` and route-private `EvalKpiCards` leave no dangling imports, as `pnpm arch` shows.
- **`fetch` ban:** The only `fetch(` in `src/lib` or `src/components` is `lib/api.ts:25`, inside the new private `request()` helper. There is none in `src/app`. The new endpoint went into a hook, `useEvalCaseDraft` in `lib/hooks/eval.ts`.
- **`lib/api.ts` change is additive:** `apiFetch` keeps its signature and behaviour. It was refactored into `request()`, `readBody()` and a thin `apiFetch`. The additions are `apiFetchWithStatus` and `api.postWithStatus`, and no existing call site changes.
- **Vendor:** `git status` shows no change under `client/src/vendor/ui`. The `vendor/shared` Eval edits are present in both copies. I diffed the `+`/`-` lines of `git diff 986e61f -- client/src/vendor` against those of `server/src/vendor` and they are identical (`VENDOR-DIFF-IDENTICAL`). The Eval changes are `EvalFindingLabel`, `EvalActualFinding` and `EvalCaseEffect` moved up, `findings`/`effect` on `EvalCaseLatestResult`, `title` on `EvalExpectationInput`, new `EvalCaseDraftOwner` and `EvalCaseDraft`, and `SkillEvalCaseRequest.input`.
- **Sub-component imports:** The panes in `eval-case-editor` import the shared `../styles` and `../helpers` of their parent, the same pattern the deleted `CaseFields` used. This is existing precedent and is not a rule violation.

```findings-json
{
  "reviewer": "architecture",
  "findings": []
}
```