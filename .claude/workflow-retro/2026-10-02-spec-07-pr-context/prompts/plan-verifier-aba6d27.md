Plan `.claude/sdd/SPEC-07/plan.md`, spec `.claude/sdd/SPEC-07/spec.md` (exact copy of `specs/07-pr-context.md` from branch `docs/spec-07-pr-context`), diff `896f72b668b0728ac05c1035a4785e99e8807798`..working tree (all uncommitted; include untracked files). Pass 1 of 2: report every Fail. Items that only a test could prove are Unverified if no test exists — test-writer DID run, so check the new tests before marking anything Unverified.

User-approved changes beyond the plan (treat as in scope, not deviations): `PrContextPreview` gained kind/origin/tokens/read_at_sha (AC-42); `PrContextOrigin` is `added | modified | default_branch` backed by new `pr_files.status` column + migration `0018_green_ironclad.sql` and optional `PrFile.status` in the vendor contract (AC-2); `RunSummary.context_fingerprint` and the stale note on the Agent runs row instead of the trace drawer (AC-38..40); `not_utf8` reason in `ReadFileAtCommitResult` (EC-7); W2b's 2-line edit in `server/src/modules/reviews/service.ts`.

Specifically rule Pass/Fail on these two suspected spec violations:
- `server/src/modules/brief/service.ts:~367` stores a null fingerprint when a non-empty list's resolver throws — vs AC-31 / planner decision Q6 (non-null whenever a list is attached).
- `server/src/modules/reviews/run-executor.ts:~285` computes the agent-doc budget from `tokensSent` before the AC-24 dedupe — vs AC-20 "minus the PR tokens actually sent".

Re-run the plan's gates (`./scripts/check.sh` server/client/core typecheck, lint, arch, test). Known pre-existing failures not caused by this work: `onboarding-tour.it.test.ts` (flaky), `skills.it.test.ts` "404s for an unknown skill" (422). e2e flow is edited but not run — Unverified is fine there; a browser validation follows later.

Return the matrix (ID | Status | Evidence) and a one-line verdict. Keep it compact: group Pass rows by range.