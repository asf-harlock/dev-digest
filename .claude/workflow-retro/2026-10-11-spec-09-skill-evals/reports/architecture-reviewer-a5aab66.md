## Hand-back 1

## Architecture review: server/ + client/ (SPEC-09: Case Editor, skill eval runs, metric trend). reviewer-core/ and e2e/ are untouched.

Zero findings. Both machine gates are green, and prose review of the seven flagged points found no documented rule broken.

### Deterministic check results
- `./scripts/check.sh server arch` (`cd server && pnpm arch`, dependency-cruiser, 8 onion rules): PASS. It ran on the working tree, which holds the tracked changes and the untracked files, so it covers this change.
- `./scripts/check.sh client arch` (`cd client && pnpm arch`, 5 rules: `shared-does-not-import-app`, `vendor-is-self-contained`, `no-private-component-from-outside-app`, `no-cross-route-private-component`, `no-circular`): PASS. Same coverage.
- `cd server && pnpm exec vitest run test/eval-contract-parity.test.ts`: 5 of 5 passed, so the eval regions of the two vendored contract copies match.
- reviewer-core / e2e / mcp / evals: no files in the diff, and none of them references `eval_runs` or `EvalRunDetail`. No machine gate exists for reviewer-core or e2e, and neither is affected.

### Findings
| Gate | Severity | File:Line | Rule | Rationale | Suggestion |
|---|---|---|---|---|---|
| none | none | none | none | No violations found. | none |

### Grounding note
Everything below is prose-grounded unless it says a tool covered it. I name the machine rule where one applies.

1. **`helpers.ts` → `pasted-diff.ts` → `frozen-input.ts` → `adapters/git/diff-parser`**
   - Not a violation.
   - `pure-helpers-stay-pure` only matches a helper's direct imports of `src/adapters/`, `db/schema|client`, the container or the ORM. `helpers.ts` imports only `./pasted-diff.js`, `./arms.js`, `./constants.js` and types.
   - `diff-parser` is in the `PURE_ADAPTER_FNS` allowlist, and `frozen-input.ts` takes `groundFindings` from `@devdigest/reviewer-core`, which is L0.
   - `pasted-diff.ts` does no I/O (only `Buffer.byteLength`).
   - Onion rule 5 (functional core stays pure) holds, and `pnpm arch` passes.

2. **Shared `EvalCaseRow`, and the sibling-folder layout of `components/eval-case-editor` and `components/metric-trend`**
   - Not a violation.
   - Each promoted component has a second consumer, so the "colocate until a second consumer" principle is met:
     - `eval-case-row`: agent `EvalCaseList` and skill `SkillCaseList`.
     - `eval-case-editor` and `delete-case-dialog`: the agent and skill `EvalsTab`.
     - `metric-trend`: agent tab, skill tab and dashboard detail.
     - `case-state-label`: consumed by `eval-case-row` and `eval-case-editor`.
   - Folders are kebab-case under `src/components/` and the files are PascalCase, as `client/CLAUDE.md` requires.
   - The sibling sub-folders with a top-level `styles.ts` and `helpers.ts` match the existing `components/diff-viewer/` layout, which holds `CodeLine`, `FileCard` and others side by side. The convention doc says a component "may" hold its own `_components/`.
   - Using sibling folders keeps shared code from importing a `_components/` path, which `no-private-component-from-outside-app` would flag. It reported nothing.
   - Shared code uses hooks from `lib/hooks/{eval,skill-eval}` and never calls `fetch`, `api.*`, `useQuery` or `useMutation` itself.

3. **`app/eval/helpers.ts` and `app/eval/constants.ts` re-exporting from shared layers**
   - Not a violation.
   - `formatRanAt` is re-exported from `@/lib/eval-format`, and `METRIC_COLORS` from `@/components/metric-trend`.
   - The direction is app → shared, as `shared-does-not-import-app` allows. `src/components` and `src/lib` import nothing from `src/app`.

4. **`highlightRange` and `scrollToHighlight` on DiffViewer, FileCard and CodeLine**
   - Not a violation.
   - Both props are additive, with defaults (`null` and `true`), inside an existing shared component.
   - `highlightLine` behaviour is unchanged, and there is no app or route import.

5. **Eval repository reads across tables, and the skills module's `DbTx`**
   - Not a violation.
   - `findingSkills`, `skillForEval`, `skillForRun`, `carriersForSkill` and `carrierLinks` read `reviews`, `agent_runs`, `agent_run_skills`, `skills`, `agent_skills` and `agents` through `t.*` inside `eval/repository.ts`.
   - Onion rule 10 and `no-cross-module-import` govern importing another module's files, and there are no such imports.
   - Rule 8 explicitly endorses scoping through joins to the workspace-owning parent. Every join here also carries a `workspace_id` predicate.
   - The existing `findingContext` already joins `findings`, `reviews`, `pull_requests`, `repos` and `agents`, so this is the established pattern. No machine gate covers it.
   - `container` has no `skillsRepo` to use instead.
   - Skills → eval goes through `this.container.evalRepo.deleteBySkill(...)`, which is rule 10 and rule 4 done correctly. No concrete adapter is imported.
   - `skills/repository.ts` exports its own `DbTx` alias, and `eval/repository.ts` has the same alias. This is a duplicated structural type and breaks no documented rule, so I report nothing.
   - The `deleteById(ws, id, beforeDelete?)` callback transaction mirrors `AgentsRepository.deleteById`.

6. **`arms.ts` vs `scoring.ts` split**
   - Not a violation.
   - `arms.ts` imports `../_shared/skill-render`, `./constants` and `./scoring`. `scoring.ts` imports only shared types, so there is no cycle (`no-circular` is clean).
   - Both files are pure kebab-case extras, allowed by the `server/CLAUDE.md` "anything extra is a kebab-case module" convention.
   - `helpers.ts` imports `classifyEffect` from `arms.ts`. `repository.ts` imports only the `CarrierLink` type from `arms.ts` and `isUniqueViolation` from `helpers.ts`, which is L3 importing L0 and fine.

7. **`eval_runs` rows owned by an agent or a skill (nullable `agent_id`)**: every agent-facing read in `eval/repository.ts` is owner-filtered. This is prose and code review only. No dependency-cruiser rule covers query predicates.
   - Filter `owner_kind = 'agent'` (via `agentRuns()` or an explicit predicate):
     - `runningRunId`
     - `latestFinishedRunRow`
     - `listRunSummaries`
     - `countFinishedRuns`
     - `recentRunSummaries` (dashboard)
     - `deleteByAgent`
     - `caseCountsByAgent` and `caseLinks` (these filter `eval_cases.owner_kind`)
   - Filter `owner_kind = 'skill'`: `runningSkillRunId`, `skillRuns()`, `deleteBySkill`.
   - The only owner-agnostic queries are:
     - `getRunRow` is called only by `getRun`, which discriminates with `isSkillRunRow` and `isAgentRunRow`. `compare` rejects non-agent rows with a 404. Both are in `service.ts` at lines 733 to 740 and 808 to 815.
     - `reapRunning` is intentionally owner-agnostic (a boot reap of dead processes).
     - `saveProgress`, `finalizeRun` and `saveSkillProgress` select by internally issued `runId` plus `status = 'running'`.
   - The `summarySelection` casts (`sql<string>` on `agentId`) are documented as relying on that filter.
   - Migrations `0023` and `0024` are generated, split into an add-columns pass and a constraints pass, and add one partial unique index per owner kind.
   - The `agent_id` and `skill_id` columns have no FK, with the cascades done programmatically through `deleteByAgent` and `deleteBySkill`. This is documented in the schema and matches the existing pattern.
   - No other module or package (`mcp/`, `e2e/`, `reviewer-core/`, `evals/`) reads `eval_runs`.

Other server checks, all clean:
- `eval/routes.ts`: every new handler starts with `getContext(app.container, req)` and declares `schema.params|body|response`. Handlers call one service method each, and there is no Fastify import outside routes.
- `eval/service.ts`: no raw SQL, no `new <Adapter>`, and `this.repo = container.evalRepo`. The LLM comes from `container.llm(...)` and git from `container.git`.
- `app.ts`: the 413 translation sits in the composition root's error handler, so it is fine.
- `eval/constants.ts`: new literals go in `constants.ts`.
- Both vendored contract copies are in sync for the eval regions, which the parity test confirms. The `CiFailOn` import difference in `eval-ci.ts` was already there before this change.

findings-json block follows.

```findings-json
{
  "reviewer": "architecture",
  "findings": []
}
```