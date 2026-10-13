## Hand-back 1

## W2b report (steps 19-22, inner loop only, nothing committed)

All five gates pass:
- `./scripts/check.sh server typecheck` PASS
- `./scripts/check.sh server lint` PASS
- `./scripts/check.sh server arch` PASS
- `./scripts/check.sh server test` PASS (516 passed)
- `./scripts/check.sh core typecheck` PASS

I added no new tests. The existing suite passes, including the SPEC-06 brief fallback tests. Step 23 owns the new ones.

### Files changed (all under `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/`)
- **`reviews/run-executor.ts` (step 19)**
  - `resolvePrContext` runs once per `executeRuns`, from the `pull` passed in at the start (EC-13). Its summary line and note lines go to the run log through the fan-out logger. A resolver throw degrades to no PR context.
  - Each agent run resolves the project docs with budget `PROJECT_CONTEXT_TOKEN_BUDGET - tokensSent`, then calls `dropPrDocsIdenticalToProject`. Docs kept are passed to the engine as `prContext`.
  - Trace `project_context` is the PR entries first (`origin: 'pr'` exactly), then the agent and skill entries. `specs_read` is the sent PR paths plus the project paths. `context_fingerprint` is written only when the list is non-empty. The failure and cancel trace carries the same entries and fingerprint.
  - A PR doc dropped as identical to the default-branch copy is logged ("sent once") and left out of the PR trace entries.
- **`brief/helpers.ts`, `brief/repository.ts`, `brief/service.ts` (step 20)**
  - `BriefPull` now carries `number` and `contextPaths`.
  - When the list is non-empty, the resolved docs go under a `## PR context` heading as `pr-context:<path>` blocks (redacted, then wrapped by reviewer-core's `wrapUntrusted`).
  - `resolveSpecs` is untouched and still runs when the list is empty.
  - The whole-prompt fitter drops PR docs last, last one first, and returns `droppedPrContext`.
  - `specs_missing` is built per path and status ("path (missing), path (truncated), path (dropped)"). It appears only when something was skipped, and also when nothing resolved.
  - `context_fingerprint` is null on the fallback path and non-null whenever a list is attached.
- **`reviews/intent-classifier.ts`, `reviews/repository/pull.repo.ts` (step 21)**
  - The classifier's private `wrapUntrusted` still wraps every existing block. Only the new `## PR context` section uses reviewer-core's `renderPrContextBlocks`, and the `PR_CONTEXT_GUARD` is appended to the system prompt only then. The `resolveProjectContextSpecs` seam still returns `[]`, so the prompt is byte-identical when no list is attached (EC-12).
  - Sources: a `spec` source with status `used` (note lists the paths), plus a separate `unreachable` `spec` source for the not-fetched link note.
  - `ClassifyIntentResult.contextFingerprint` is returned. `UpsertIntentMeta.contextFingerprint` is persisted by `upsertIntent` into `pr_intent.context_fingerprint` and returned by `getIntent`.
- **Step 22:** nothing to add. None of my code touches the save path, and no brief, intent or run is started from it.

### Deviations
- I edited `reviews/service.ts`, which is outside my owned list. The change is two lines in `runIntentClassification`: destructure `contextFingerprint` from `classifyIntent` and pass it in the `upsertIntent` meta. Without it the fingerprint is never persisted.
- The brief fingerprint is `null` if `resolvePrContext` throws. That should not happen, since the resolver never throws.

### Needs the caller or another workstream
- **`pulls/routes.ts` intent DTO (around line 295-310):** it builds `intent` for the PR detail response and does not yet return `context_fingerprint: intentRow.contextFingerprint`. `getIntent` now supplies it. Whoever owns that file must add the field, or the client stale check (AC-36, AC-39) won't work for intent.
- **Brief GET route:** the brief GET passes `context_fingerprint` through `meta` automatically, because `BriefResponse.meta` includes it.
- **Handoff for review:** the brief's PR-context path uses the default 8k PR-context budget (the resolver's own default). The SPEC-04 `SPEC_DOCS_TOKEN_BUDGET` of 10k is not applied to it.