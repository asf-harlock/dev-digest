SPEC-07 verify #1 fix round. Plan: `.claude/sdd/SPEC-07/plan.md`. Spec: `.claude/sdd/SPEC-07/spec.md` (copy of `specs/07-pr-context.md` — read the exact AC/EC/NFR text for each item). Fail rows: `.claude/sdd/SPEC-07/verify-1.md` § Fail. All SPEC-07 work is uncommitted in the working tree; you're the only agent running. Do not commit. Do not touch vendor contracts unless strictly required (if so, identical hunks in both copies).

Fix exactly these rows:
1. **AC-31** — `server/src/modules/brief/service.ts:~367`: when the attached list is non-empty and `resolvePrContext` throws, store a non-null fingerprint computed from the attached paths as unresolved (use `computeContextFingerprint` from `server/src/modules/_shared/pr-context-truncate.ts`). Add a test in `server/test/brief-pr-context.test.ts` (`it('AC-31: …')`).
2. **AC-20** — `server/src/modules/reviews/run-executor.ts:~285`: the agent/skill-doc budget must be 16,000 minus the PR tokens actually sent after the AC-24 dedupe. Pick the simplest correct approach (e.g. resolve project docs, dedupe, and if anything was dropped, re-resolve project docs with the larger budget). Add a dedupe+budget test in `server/test/run-executor-pr-context.test.ts`.
3. **AC-7** — add the Attach/Attached toggle to `PrContextPreviewDrawer` per AC-7 (wired to the same save as the tab; disabled while saving; respects the 20-path cap).
4. **AC-8** — footer text per AC-8 exactly: the "≈ N of 10,000" wording and the "agent and skill documents keep at least 6,000 tokens per review call" line (i18n in `client/messages/en/prContext.json`).
5. **EC-19** — empty-attachable copy per EC-19 (explain that a `.md` under `specs/`, `docs/` or `insights/` becomes attachable).
6. **EC-20** — add the "Clear filter" action on the filter-no-match state.
7. **NFR-3** — `server/src/adapters/git/simple-git.ts` `ensureInflight`: at most one fetch per clone at a time (key by clone; a second caller for a different SHA waits for the in-flight fetch, then proceeds). Extend `simple-git.test.ts`.

Also, since it is a one-liner on the same route: if `/pulls/:id/context/preview` validates the path before the workspace/PR lookup, reorder so a PR outside the workspace returns 404 first (EC-22).

Update/extend client tests in `ContextTab.test.tsx` for items 3-6 with IDs in the names. Gates: `./scripts/check.sh server typecheck`, `server lint`, `server arch`, `server test`, `client typecheck`, `client lint`, `client arch`, `client test`, `core typecheck`. Report briefly: per item fixed/disputed with file:line, gate results.