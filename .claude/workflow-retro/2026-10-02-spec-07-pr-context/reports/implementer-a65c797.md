## Hand-back 1

All 7 rows are fixed, plus the EC-22 reorder. None were disputed, and I made no vendor edits. All requested gates pass.

1. **AC-31** — fixed. In `server/src/modules/brief/service.ts`, a `resolvePrContext` throw on a non-empty list now stores a fingerprint from `computeContextFingerprint`, with every attached path marked unreadable. New test in `server/test/brief-pr-context.test.ts`: `AC-31: a resolver failure on a non-empty list still stores a non-null fingerprint`. The test makes the tokenizer throw on the document text to force the throw.
2. **AC-20** — fixed in `server/src/modules/reviews/run-executor.ts` (project-context block, ~L285-315).
   - The project docs are resolved once at the full 16,000 budget so the AC-24 duplicates are found.
   - They are then re-resolved at 16,000 minus the PR tokens actually sent, but only when some PR tokens were sent.
   - I resolve at the full budget first on purpose. A first pass at the reduced budget could leave the duplicate over budget, so it would never be deduped.
   - Known edge: if the reduced budget pushes a project copy out after its PR twin was dropped, that document is not sent. This follows from "PR tokens actually sent".
   - New test in `server/test/run-executor-pr-context.test.ts`: `AC-20 / AC-24: tokens of a deduped PR copy go back to the agent documents`.
3. **AC-7** — fixed. `PrContextPreviewDrawer` now has an Attach/Attached toggle using `aria-pressed`. `ContextTab.tsx` wires it to the same `persist` as the tab. It is disabled while saving and when attaching would exceed the 20-path cap. Three tests, all named `AC-7: …`.
4. **AC-8** — fixed.
   - The footer now reads "≈ N of 10,000 tokens" (number formatting in the message).
   - A new line says agent and skill documents keep at least 6,000 tokens per review call.
   - The 6,000 is a local constant in `PrContextFooter.tsx` (16,000 minus 10,000), not imported from the server. Both text changes are in `client/messages/en/prContext.json`.
   - The existing `AC-2 / AC-8 / AC-9 …` test is updated.
5. **EC-19** — fixed. The empty-attachable copy now says a `.md` under `specs/`, `docs/` or `insights/` committed to the PR or the default branch becomes attachable. The `EC-19` test is updated.
6. **EC-20** — fixed. The no-match text is now "No documents match", with a "Clear filter" button that resets the filter. The `EC-20` test is extended to click it.
7. **NFR-3** — fixed in `server/src/adapters/git/simple-git.ts` (`ensureCommit`).
   - Fetches for one clone now run through a per-clone queue, so a second caller for a different SHA waits for the in-flight fetch and then proceeds.
   - Same clone and SHA still shares the in-flight result.
   - New test in `simple-git.test.ts`: `NFR-3: two different SHAs on one clone never fetch at the same time`. It asserts at most one fetch is active at a time.
8. **EC-22** — fixed. In `server/src/modules/pulls/context-service.ts` `preview()`, the workspace/PR lookup (404) now runs before path validation (422). I added no test for this reorder.

**Gates**
- `server typecheck`: PASS
- `server lint`: PASS
- `server arch`: PASS
- `server test`: PASS (600 passed)
- `client typecheck`: PASS
- `client lint`: PASS
- `client arch`: PASS
- `client test`: PASS (474 passed)
- `core typecheck`: PASS

I did not run `*.it.test.ts` suites, so `pulls-context.it`, which exercises the `preview` route, was not rerun after the EC-22 reorder.