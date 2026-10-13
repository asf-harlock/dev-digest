## Hand-back 1

## Architecture review: SPEC-10 Phase B (`server/src/modules/eval/`, `client/`), `a4d69df`..working tree

### Deterministic check results
- `cd server && pnpm arch`: pass. "no dependency violations found (240 modules, 871 dependencies cruised)". It ran on the working tree, so it covers the uncommitted and untracked files.
- `cd client && pnpm arch`: pass. "no dependency violations found (805 modules, 2623 dependencies cruised)". It ran on the working tree. `client/.dependency-cruiser.cjs` defines `shared-does-not-import-app`, `vendor-is-self-contained`, `no-private-component-from-outside-app`, `no-cross-route-private-component` and `no-circular`.
- Not machine-gated, so checked by grep and reading only:
  - the "every component is a folder" and kebab-case rules
  - the `fetch` ban
  - repository-only persistence
  - the optional-body route exception
  - whether `vendor/ui` and `vendor/shared` were touched

### Findings
| Gate | Severity | File:Line | Rule | Rationale | Suggestion |
|---|---|---|---|---|---|
| none | none | none | none | Zero findings. Each question you raised is answered under "Grounding note". | none |

### Grounding note
Every answer below rests on prose rules or direct reading, except where a gate is named.

**Server (onion layering)**
- **Cycle `helpers.ts` -> `scoring.ts`:** none.
  - `scoring.ts` has only `import type {...} from '@devdigest/shared'`.
  - `arms.ts` imports `constants.js` and `scoring.js`. `pasted-diff.ts` imports `constants.js` and `frozen-input.js`. None of them imports `helpers.js`.
  - `no-circular` and `pure-helpers-stay-pure` also passed, and `scoring.ts` is a pure file.
- **`repository.ts` importing `pickLatestSource` / `toFrozenCase` / `isUniqueViolation` from `helpers.ts`:** no violation.
  - `helpers.ts` is L0 and `repository.ts` is L3, so the inward direction is allowed (onion rule 5, `[Convention]`).
  - `helpers.ts` imports nothing from `repository.ts`, so there is no back-edge. This is unlike the known `agents` cycle.
  - `isUniqueViolation` was already imported from `helpers.js` before this change.
- **Persistence:** `service.ts` and `helpers.ts` have no `drizzle-orm` or `db/schema` imports. `helpers.ts` takes only `db/rows.ts` types (rules 2 and 5). The new column is in `db/schema/eval.ts`, with migration `0025_lovely_jamie_braddock.sql` (`ALTER TABLE "eval_runs" ADD COLUMN "scope" text DEFAULT 'set' NOT NULL`), the right place.
- **One run path:**
  - `startRun` is `launchAgentRun(..., { scope: RUN_SCOPE.set }, ...)` (`service.ts:543-548`).
  - `startSkillRun` is `launchSkillRun(..., { scope: RUN_SCOPE.set }, ...)` (`service.ts:728-734`).
  - `startCaseRun` builds `RunTarget = { scope: RUN_SCOPE.case, frozen: toFrozenCase(row) }` and calls the same two launchers (`service.ts:568-573`).
  - `casesOf` is the only place that picks the one-case set or `repo.casesForRun`.
  - There is no second run path.
- **Container use:** the service takes `container.evalRepo` and `container.agentsRepo`. It constructs no concrete adapter (rule 4).
- **Route hand-parsing (`routes.ts:257`):** `SkillEvalRunRequest.safeParse(req.body ?? undefined)` departs from rule 6 and `server/CLAUDE.md:40`.
  - It is the documented optional-body exception in `server/INSIGHTS.md` (2026-09-20, line 155).
  - The route comment cites that entry and the precedents `reviews/routes.ts` and `conventions/routes.ts`.
  - A malformed body throws `ValidationError`, so the handler stays at `getContext`, parse, one service call, plus the 202. `eval/routes.ts:86` already used the same pattern.
  - No machine gate covers this rule.
- **`vendor/shared` `eval-ci.ts`:**
  - The Phase B diff against `a4d69df` is identical in both copies. I compared the `+`/`-` lines of `git diff a4d69df` for each copy and they match.
  - The full files differ in places this change did not touch. `AgentManifest` and `CiFailOn` exist only in the server copy, and the `provider` enum differs. That is the pre-existing drift the CLAUDE.md gotcha describes, so it is out of scope.

**Client (UI layering)**
- **Carrier dialog:** `components/carrier-run-dialog/` is a kebab-case shared folder with `RunDialog.tsx`, `index.ts`, `helpers.ts`, `styles.ts` and a test.
  - It imports only `@/lib/*`, the kit and `@devdigest/shared`, with no `@/app` or relative route imports.
  - The old route folder `SkillEditor/_components/RunDialog` is gone.
  - Three consumers import it via `@/components/carrier-run-dialog`: `SkillEditor.tsx`, the skills `EvalsTab`, and `EditorModal`. Making it shared is what removes the route-to-route `_components` import (`no-cross-route-private-component` passed).
- **`_components/` in `src/components/`:** none. `grep _components src/components` finds no imports of one.
- **`use-case-run.ts`:** placement is acceptable, so no finding.
  - It sits in the shared layer (`src/components/eval-case-editor/`), which is where "used by two or more features" belongs (placement rule 3).
  - It sits beside the existing `use-escape-key.ts` and `use-narrow-viewport.ts` in that folder, so it matches the neighbours.
  - It is exported through the folder's curated `index.ts` (`useCaseRun`, `CaseRunFlow`).
  - It imports only `@/lib/hooks/*` and `./helpers`.
  - Moving it to `lib/hooks` is optional. The skill does not require it. `lib/hooks/*` holds data hooks, and this one is UI-flow state for the editor.
- **`lib/modal-width.ts`:** acceptable. It is a shared, feature-agnostic helper used by four components in two folders (`carrier-run-dialog`, `delete-case-dialog`, `eval-case-editor/DiscardDialog` and `EditorModal`), so it belongs in `src/lib/`.
  - `lib/` already holds non-`hooks/` React files (`theme.tsx`, `toast.tsx`, `providers.tsx`).
  - It has a pure `fitModalWidth` plus one hook, and it leaves `vendor/ui` untouched.
- **`DeleteCaseDialog` edited outside `eval-case-editor/`:** it is its own shared folder (`components/delete-case-dialog/`). The edit only swaps in `useFittedModalWidth(460)`, so there is no layering issue.
- **`fetch`:** no `fetch(` or direct `api.*` call in `src/components` or `src/app` outside tests. The only `refetch` hits are TanStack Query. Run calls go through `useStartEvalCaseRun` / `useStartSkillEvalRun` in `lib/hooks`.
- **`vendor/ui`:** `git diff a4d69df --stat -- src/vendor/ui` is empty, so it is untouched.
- **Component-folder convention:** the new `CaseRunStatus/`, `ResultBanner/`, `RunOnSaveToggle/`, `OwnerPicker/` and `TypeBanner/` are each a folder with `<Name>.tsx` and `index.ts`. Their nesting inside the kebab-case `eval-case-editor/` follows the existing `ActualOutputPane/`, `Field/` and `InputTabs/` layout, so it matches the neighbours.

```findings-json
{
  "reviewer": "architecture",
  "findings": []
}
```