Execute `.claude/sdd/SPEC-07/plan.md`. Spec: `.claude/sdd/SPEC-07/spec.md` (exact copy of `specs/07-pr-context.md` from branch `docs/spec-07-pr-context`).

You are workstream W2c of a multi-agent run. Step 13 only. Files owned: `reviewer-core/src/prompt.ts`, its test, `reviewer-core/docs/prompt-assembly.md`, and `reviewer-core/src/run.ts` / `index.ts` only if the `ReviewInput` plumbing needs the new field. Run only the inner loop. Do not commit. W2a (server) and W2d (client) run in parallel on other files — don't touch them. reviewer-core uses npm, not pnpm.

W1 contracts are in the working tree (server vendor copy, which reviewer-core reads). W2b will later import your exported helper (e.g. `renderPrContextBlocks`) and the hardened `wrapUntrusted` from reviewer-core into the server's brief and intent-classifier, so export them and keep the API simple.

Gates: `./scripts/check.sh core typecheck`, `./scripts/check.sh core test`. Report back briefly: files changed, gate results, and the exact exported names/signatures (the `PromptParts.prContext` field, the helper, `wrapUntrusted`, the guard constant) and the import path the server should use.