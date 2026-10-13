## Hand-back 1

## Re-check of SPEC-07 Fail rows

| ID | Status | Evidence |
|---|---|---|
| AC-31 | Pass | `server/src/modules/brief/service.ts:367-375` now falls back to `computeContextFingerprint` with every path `unreadable` when the resolver throws on a non-empty list. It returns null only for an empty list. The new test is `server/test/brief-pr-context.test.ts:156` ("resolver failure on a non-empty list still stores a non-null fingerprint"). |
| AC-20 | Pass | `server/src/modules/reviews/run-executor.ts:287-308` resolves once at the full budget to find the AC-24 duplicates. It then re-resolves with 16,000 minus the kept PR tokens actually sent. The new test is `server/test/run-executor-pr-context.test.ts:197` ("AC-20 / AC-24: tokens of a deduped PR copy go back to the agent documents"). |
| AC-7 | Pass | `PrContextPreviewDrawer.tsx` has an Attach/Attached toggle (`aria-pressed`, lines 48-54). `ContextTab.test.tsx:293` covers Attach saving the list with the path appended and Attached removing it. `ContextTab.test.tsx:322` covers Attach disabled at the 20-document cap. |
| AC-8 | Pass | `client/messages/en/prContext.json` has `footer.total` ("≈ N of 10,000 tokens") and `footer.reserve` ("Agent and skill documents keep at least 6,000 tokens per review call."). `PrContextFooter.tsx` uses a 6000 constant. `ContextTab.test.tsx:172` asserts the reserve line. |
| EC-19 | Pass | `attachable.empty` in `prContext.json` now says a .md under specs/, docs/ or insights/ committed to the PR or the default branch becomes attachable. `ContextTab.test.tsx:110` asserts it. |
| EC-20 | Pass | `prContext.json` has `attachable.noMatch` and `attachable.clearFilter`. `ContextTab.test.tsx:117` clicks "Clear filter" and checks the filter input is empty and the list is restored. |
| NFR-3 | Pass | `server/src/adapters/git/simple-git.ts:29,258-275` adds a per-clone `cloneQueue` chain. The same clone and SHA share the in-flight promise, and a different SHA waits for the previous fetch. Tests are `simple-git.test.ts:212` (concurrent readers share one fetch) and `:237` (two SHAs on one clone never fetch at the same time). |
| EC-22 (404 before 422) | Pass, with a test gap | `server/src/modules/pulls/context-service.ts:125-127` does `this.require()` (404) before `validatePrContextPath` (422). `pulls-context-routes.test.ts:141` and `pulls-context.it.test.ts:120` assert 404 on GET, PUT and preview for a foreign or unknown PR. They use a valid path, so no test sends an invalid path to a foreign PR. The ordering is verified from the code only. |

### Gates re-run (my own runs)
- `./scripts/check.sh server test` — PASS, 600 passed.
- `./scripts/check.sh client test` — PASS, 474 passed.
- `cd server && pnpm exec vitest run test/pulls-context.it.test.ts` — PASS, 9/9 (Docker up).

### Verdict
All 8 re-checked rows are Pass and all three gates are green. The only caveat is the EC-22 ordering, which no test covers with an invalid path on a foreign PR.