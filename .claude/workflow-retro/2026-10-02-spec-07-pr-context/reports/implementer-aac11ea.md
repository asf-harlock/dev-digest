## Hand-back 1

W2c (step 13) is done. `./scripts/check.sh core typecheck` PASS; `./scripts/check.sh core test` PASS (67 tests). Inner loop only; nothing committed.

**Files changed** (all under `/Users/harlock/Downloads/Sites/devdigest/reviewer-core/`):
- `src/prompt.ts`
- `src/review/run.ts`: `ReviewInput.prContext` is forwarded into `promptParts`, so single-pass and map-reduce both get it. The plumbing is in `run.ts`, not `src/run.ts` as the task said, because that is where `ReviewInput` lives.
- `src/index.ts`: re-exports the new names.
- `test/prompt.test.ts`: new "PR context" tests covering:
  - the prompt is byte-identical when `prContext` is empty or undefined;
  - order of the `## PR context` blocks, and that the section sits before `## Project context`;
  - the guard is added only when a `pr-context:` block is present;
  - case/whitespace-variant closing tags, a forged opening tag, and `"`, `<`, `>` in the label.
- `docs/prompt-assembly.md`

**Exports.** Import path for the server: `@devdigest/reviewer-core`.
- `PromptParts.prContext?: { path: string; text: string }[]`. It is also on `ReviewInput` as `prContext?: { path: string; text: string }[]`.
- `renderPrContextBlocks(docs: { path: string; text: string }[] | undefined): string | undefined`. It wraps each doc with `wrapUntrusted('pr-context:' + path, text)` and joins them with a blank line. It returns `undefined` for an empty or undefined list.
- `wrapUntrusted(label: string, content: string): string` was already hardened and already exported. It handles case/whitespace-variant closing tags, forged opening tags, and escaping `"`, `<`, `>` in the label. It is unchanged.
- `PR_CONTEXT_GUARD: string` is a new exported constant. `assemblePrompt` appends it to the system prompt only when at least one `pr-context:` block is present. It goes after `PROJECT_CONTEXT_GUARD` if both apply.

**For W2b.** The brief and intent prompts can call `renderPrContextBlocks` under a `## PR context` heading. Append `PR_CONTEXT_GUARD` to their own system prompts when the result is defined. That replaces the private `wrapUntrusted` copy in `server/src/modules/reviews/intent-classifier.ts`.

**Deviation: trace `assembly.specs` ordering.** `assembly.specs` now carries PR-context blocks first, then specs, then project context. I did this so the Trace drawer can list PR-context entries first, as step 17 expects. The user prompt itself keeps the separate `## PR context` section. Specs and project context still render under `## Project context` exactly as before. I did not add a new `PromptAssembly` field, so the `PromptAssembly` contract is unchanged.