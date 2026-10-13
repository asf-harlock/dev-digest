Execute `.claude/sdd/SPEC-05/plan.md`, **Slice 1 only (steps 1-3)**. Spec: `specs/05-onboarding-tour.md` (Status: approved). Repo root: /Users/harlock/Downloads/Sites/devdigest, branch L05-lab.

You are workstream S1 of a multi-agent run. Files owned: `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, `server/src/vendor/shared/adapters.ts` (the user explicitly authorised editing this vendored file for the `GitClient` history method — server copy only, do NOT touch `client/src/vendor/shared/adapters.ts`), `server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts`, plus the contract test files named in step 3. Run only the inner loop.

Notes:
- Both `knowledge.ts` copies change together; server `.default()`, client `.optional()`, `.nullish()` for persisted jsonb meta so old `onboarding` rows still parse. Check whether anything already imports the staged `Onboarding`/`OnboardingSection`/`OnboardingLink` symbols (grep server/, client/, reviewer-core/) and keep them compiling.
- `historyCounts` must use argv arrays (no shell interpolation), window is a validated integer, 60 s abort, never throws on a shallow/missing clone in a way that crashes callers (callers decide fallback) — document the error contract in the port's JSDoc.
- Do not commit; the orchestrator commits the slice.
- Slice 1 gates: `./scripts/check.sh server typecheck`, `./scripts/check.sh client typecheck`, `./scripts/check.sh core typecheck`, `./scripts/check.sh server test`.
Report: files changed, gate results (PASS/FAIL lines only), and any deviation from the plan.

---
## Resume 1

Follow-up fix (slice-1 contract gap found in slice 2): SPEC-05 AC-9 requires each first-task card to show a complexity label rendered as text (`Low`, `Medium`, `High`) marked as a suggestion, but `TourFirstTask` in the contract you wrote has only title/description/paths. The slice-2 server module and client page are now in the working tree (uncommitted) — you own this cross-cutting fix end to end:
1. Add `complexity` (`'low'|'medium'|'high'`) to `TourFirstTask` in BOTH `server/src/vendor/shared/contracts/knowledge.ts` and `client/src/vendor/shared/contracts/knowledge.ts` — `.nullish()` so previously stored rows parse (server may `.default(null)`-style per the existing pattern, client `.optional()`), plus contract tests in both copies.
2. Server skeleton (`server/src/modules/onboarding-tour/helpers.ts` `buildSkeleton`): give each deterministic first task a complexity by a simple documented rule (e.g. docs/tests-only targets → low, otherwise medium); update `helpers.test.ts`. Slice 3 will let the model supply it.
3. Client `client/src/app/repos/[repoId]/onboarding-tour/_components/FirstTasksSection/`: replace the current "Suggestion"-only badge with the complexity text label ("Low/Medium/High complexity" style, i18n in `client/messages/en/onboarding.json`) plus the "suggested" marker, conveyed by text not colour alone (NFR-8); when complexity is null, show only the suggestion marker. Update/add its test.
Gates: `./scripts/check.sh server typecheck`, `server lint`, `server test`, `client typecheck`, `client lint`, `client test`, `core typecheck`. Don't commit. Report files changed + PASS/FAIL lines.