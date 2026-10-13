Execute `.claude/sdd/SPEC-07/plan.md`. Spec: `.claude/sdd/SPEC-07/spec.md` (exact copy of `specs/07-pr-context.md` from branch `docs/spec-07-pr-context`).

You are workstream W2b of a multi-agent run. Steps 19-22 only. Files owned: `server/src/modules/reviews/{run-executor.ts,intent-classifier.ts,repository/*}`, `server/src/modules/brief/*`, plus whatever trace-persistence file builds `RunTrace` inside `server/src/modules/reviews/`. Run only the inner loop. Do not commit. W1, W2a, W2c, W2d are done and in the working tree (uncommitted); do not edit their files.

What earlier workstreams provide:
- `server/src/modules/_shared/pr-context.ts`: `resolvePrContext({ git: container.git, tokenizer: container.tokenizer, repo:{owner,name}, clonePath: await usableClonePath(repo.clonePath), pr:{number, headSha, contextPaths}, budget? })` → `{ entries, sent, tokensSent, fingerprint, notes }`. Never throws, no LLM. Also `formatPrContextNote`, `formatPrContextSummary`, `prContextLabel`, `dropPrDocsIdenticalToProject(prDocs, projectDocs) → {kept, dropped}`. Read the file for exact types.
- AC-24 order: resolve PR context first, then the SPEC-04 project docs with budget `16_000 - tokensSent`, then `dropPrDocsIdenticalToProject`, then send.
- `@devdigest/reviewer-core`: `ReviewInput.prContext?: {path,text}[]`, `renderPrContextBlocks(docs)` (undefined when empty), `wrapUntrusted`, `PR_CONTEXT_GUARD`.
- Contracts: `RunTrace.context_fingerprint`, `BriefEnvelope.context_fingerprint`, `PrIntentRecord.context_fingerprint`; DB column `prIntent.contextFingerprint`; `pullRequests.contextPaths`.

Hard constraints:
- **Intent classifier — user decision 2(a):** keep the classifier's private `wrapUntrusted` copy for ALL existing blocks. Use reviewer-core's `renderPrContextBlocks`/`wrapUntrusted` ONLY for the new `pr-context:` blocks. With an empty attached list the intent prompt must be byte-identical to today's (EC-12). Do not replace the private copy.
- **Trace entries:** PR-context `project_context` entries must be written with `origin: "pr"` exactly — the client matches on that string.
- Brief: `resolveSpecs` stays unchanged as the fallback when the list is empty; fingerprint null on the fallback path, non-null whenever a list is attached (even if nothing resolves).
- Saving the list must trigger no brief/intent/run (AC-41).

Gates: `./scripts/check.sh server typecheck`, `server lint`, `server arch`, `server test`, `./scripts/check.sh core typecheck`. Report back briefly: files changed, gate results, deviations.