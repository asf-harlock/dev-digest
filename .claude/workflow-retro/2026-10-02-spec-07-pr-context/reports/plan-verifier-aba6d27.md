## Hand-back 1

## Plan verification: SPEC-07 PR Context (pass 1 of 2, Fails first)

### Matrix (ID | Status | Evidence)
| ID | Status | Evidence |
|---|---|---|
| **AC-31** (suspect 1) | **FAIL (low severity)** | `brief/service.ts:~367`: `attachedPaths.length===0 ? null : (prResolved?.fingerprint ?? null)`. When `resolvePrContext(...).catch(() => null)` fires on a non-empty list, `prResolved` is null and the stored fingerprint is null. The agent-doc fallback is not used in that case, so this breaks AC-31 and planner Q6. The branch is nearly unreachable, because the resolver is documented to "never throw". No test covers it. The EC-9 test, which asserts a non-null fingerprint, goes through the resolver and does not hit this path. The fix is to compute the fingerprint from the attached paths as unresolved when the resolver throws. |
| **AC-20** (suspect 2) | **FAIL (low severity)** | `run-executor.ts:285`: `PROJECT_CONTEXT_TOKEN_BUDGET - (prContext?.tokensSent ?? 0)`. This is computed before the AC-24 dedupe at lines 294-304. A PR doc that is dropped as identical to the default-branch copy is never sent, but its tokens are still subtracted from the budget. The spec says "PR-context documents actually sent". The test at `run-executor-pr-context.test.ts:170` has no dedupe case, so it doesn't catch this. The error is conservative: the agent budget is too small, never too large. It comes from a circular dependency, because dedupe needs the resolved agent docs. A fix would be a second pass or re-resolving after dedupe. |
| **AC-7** | **FAIL** | `PrContextPreviewDrawer.tsx` renders the path, kind, origin, tokens and markdown, but has no Attach/Attached toggle. A grep for "attach" finds nothing in the drawer. |
| **AC-8** | **FAIL (partial)** | `PrContextFooter.tsx` and the `footer.total` message render "≈ {used} / {limit} tokens". There is no "agent and skill documents keep at least 6,000 tokens per review call" line anywhere in `prContext.json` or the footer. The "≈ N of 10,000" wording also differs. |
| **EC-19** | **FAIL** | `attachable.empty` reads "No more documents are available to attach." It does not explain that a `.md` under `specs/`, `docs/` or `insights/` becomes attachable. |
| **EC-20** | **FAIL (partial)** | `ContextTab.tsx:111` shows only the `attachable.noMatch` text ("No documents match the filter."). There is no "Clear filter" action. |
| **NFR-3** | **FAIL (minor)** | `simple-git.ts` `ensureInflight` is keyed by `clonePath + sha`. Two different SHAs on the same clone can fetch concurrently. The spec says at most one fetch per clone at a time. |
| AC-1, AC-2, AC-3, AC-4 (client wiring), AC-5, AC-6 | Pass | `page.tsx:190`; `PrDetailHeader.tsx:124` (the badge is `contextCount \|\| undefined`); `ContextTab.tsx`; `PrContextRow.tsx`; migration 0017/0018; `pulls-context.it.test.ts` and `pulls-context-routes.test.ts`. |
| AC-9, AC-10..AC-13 | Pass | `context-service.ts` (`map_reduce`, `computeSuggestions`); the routes tests cover AC-9, AC-10/12 and EC-1. |
| AC-14..AC-19 | Pass | `pr-context.ts` `resolvePrContext`: the budget loop, the 500 floor, `truncated` and `over_budget`, and later docs still evaluated; `pr-context.test.ts`. AC-16 holds because the SPEC-04 resolver is unchanged. |
| AC-21..AC-28 | Pass | `reviewer-core/src/prompt.ts:206-207` puts `## PR context` before `## Project context`; `PR_CONTEXT_GUARD` is conditional; the `run-executor-pr-context.test.ts` tests (AC-21/22/25/26/28, AC-24 both directions); the `originPr` label in `runs.json`. |
| AC-29, AC-30, AC-32..AC-37 | Pass | `brief-pr-context.test.ts`; `intent-classifier.test.ts` (AC-32..36); `it` test AC-36; `pr-context-truncate.ts` fingerprint. |
| AC-38..AC-40 | Pass | The strings are in `brief.json:68`, `intent.json:39` and `prReview.json` (`contextStale`, on the Agent runs row as approved). `RunSummary.context_fingerprint` is tested at it-test line 187. The client unit tests pass. |
| AC-41, AC-42 | Pass | The save path writes only `context_paths`; tests at `routes.test.ts:193` and the AC-42 tests. |
| EC-1..EC-6, EC-8..EC-18, EC-21..EC-25, EC-27, EC-28 | Pass | Server tests: EC-1, 3, 8, 9, 10, 11, 12, 13, 16, 21, 22, 23, 24, 25, 27, 28. The client skeleton and `ErrorState` Retry cover EC-17/18; the footer covers EC-14/15. |
| EC-7 | Pass | The `not_utf8` reason in `simple-git.ts` maps to `unreadable` in the resolver. |
| EC-26 | Unverified | Suggestion logic exists in `pr-context-paths.ts`. I did not find a test for an unresolved reference, only the resolved SPEC-NN case. |
| NFR-1, NFR-2, NFR-4..NFR-10, NFR-12 | Pass | Tests assert one LLM call. Workspace scoping is tested. Vendor hunks are identical in both copies for brief, platform, review-api and trace. `aria-live` regions are in the footer. Move buttons carry `aria-label`, and the checkbox's accessible name is the path. NFR-2 (3 s for 20 paths) has no timing test, so it is **Unverified**. NFR-6's 24px target size and visible focus are asserted only by code comment, so they are **Unverified**. NFR-8: the stale note for runs is in `prReview.json`, per the approved change. |
| NFR-11 | Pass / e2e Unverified | The server returns `cloned:false` with no git command (tested). The e2e flow is edited but not run. |
| UI-1..UI-6, UI-9, UI-10, UI-12 | Pass | `ls-tree.ts` and `simple-git.ts` use `--literal-pathspecs`, `ls-tree -l -z ... --` and `cat-file blob <oid>`. `validatePrContextPath` is used. Hardened `wrapUntrusted` is used in all three consumers. EC-28 tests cover brief and intent. |
| UI-7 | Pass | The drawer uses `SafeMarkdown`. |
| UI-8 | Unverified | I did not confirm that the Trace drawer renders the text as plain preformatted text. |
| UI-11 | Pass | Suggestions only extract `SPEC-NN` and `specs/NN-` tokens. |

### Gates re-run (my own runs)
- `./scripts/check.sh server typecheck`: PASS. `lint`: PASS. `arch`: PASS. `test`: PASS (597).
- `./scripts/check.sh client typecheck`, `lint`, `arch`: all PASS. `test`: PASS (471).
- `./scripts/check.sh core typecheck`: PASS. `test`: PASS (67). Core has no lint gate.
- `server/test/pulls-context.it.test.ts` against Docker: PASS (9 tests). I ran only this one `.it` suite.

### Not covered by the plan (out of scope)
- `/pulls/:id/context/preview` validates the path (422) before the workspace check (404), so a foreign PR with a bad path returns 422 instead of 404.
- Untracked `.playwright-mcp/` is in the working tree.

### Verdict
The two suspects are both **Fail**, low severity: AC-31 (null fingerprint in the resolver-throws branch) and AC-20 (budget computed before the AC-24 dedupe). Overall there are 7 Fails: AC-31, AC-20, AC-7, AC-8, EC-19, EC-20 and NFR-3. The four client Fails (AC-7, AC-8, EC-19, EC-20) are real gaps against the spec text. The Unverified items are EC-26, NFR-2, NFR-6 (24px target and focus), UI-8 and the e2e flow. Everything else is Pass and all gates are green.

### Spec status
Not ready for `implemented`: AC-7, AC-8, AC-20, AC-31, EC-19, EC-20 and NFR-3 Fail. EC-26, NFR-2, NFR-6, UI-8 and NFR-11 (e2e) are Unverified.