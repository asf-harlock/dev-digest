Execute `.claude/sdd/SPEC-07/plan.md`. Spec: `.claude/sdd/SPEC-07/spec.md` (exact copy of `specs/07-pr-context.md` from branch `docs/spec-07-pr-context`).

You are workstream W2d of a multi-agent run. Steps 14-18 only. Files owned: `client/src/lib/hooks/pr-context.ts`, `client/src/lib/hooks/index.ts`, `client/src/app/repos/[repoId]/pulls/[number]/**`, `client/messages/**`. Run only the inner loop. Do not commit. W2a (server routes) and W2c (reviewer-core) run in parallel — don't touch their files; the server routes may not exist yet, so build against the contracts.

W1 is in the working tree (uncommitted): use `client/src/vendor/shared/contracts/platform.ts` (`PrContextResponse`, `PrContextEntry`, `PrContextSaveBody`, `PrContextPreview`, `PrContextOrigin` = `changed | default_branch`), `contracts/trace.ts` (`ProjectContextEntry.status` now includes `truncated`; `RunTrace.context_fingerprint`), `contracts/brief.ts` (`BriefEnvelope.context_fingerprint`), `contracts/review-api.ts` (`PrIntentRecord.context_fingerprint`). Routes per spec AC-4/AC-6/AC-42: `GET`/`PUT /pulls/:id/context`, `GET /pulls/:id/context/preview?path=`.

Client typecheck currently fails with exactly one error: `.../_components/RunTraceDrawer/_components/ProjectContextSection/constants.ts(4)` — a `Record<status, …>` missing the new `truncated` key. Fix it as part of step 17.

Gates: `./scripts/check.sh client typecheck`, `client lint`, `client arch`, `client test`. Report back briefly: files changed and gate results.