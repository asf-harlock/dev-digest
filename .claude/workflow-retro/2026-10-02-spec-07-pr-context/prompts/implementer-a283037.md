Execute `.claude/sdd/SPEC-07/plan.md`. Spec: `.claude/sdd/SPEC-07/spec.md` (an exact copy of `specs/07-pr-context.md` from branch `docs/spec-07-pr-context`; treat it as the spec — references to `specs/07-pr-context.md` mean this file).

You are workstream W1 of a multi-agent run. Steps 1-7 only. Files owned: `server/src/vendor/shared/{adapters.ts, contracts/{trace,brief,review-api,platform}.ts}` and their `client/src/vendor/shared/` twins, `server/src/modules/_shared/context-paths.ts`, `server/src/db/schema/{pulls,reviews}.ts`, and one new migration generated with `cd server && pnpm db:generate` (never hand-edit it). Do not touch any other file. Run only the inner loop.

Notes:
- Vendor edits are limited to the SPEC-07 hunks; leave pre-existing server/client drift alone. Make the SPEC-07 hunks identical in both copies.
- Adding the two new `GitClient` methods to the interface will break typecheck for implementers/mocks (`server/src/adapters/git/simple-git.ts`, `server/src/adapters/mocks.ts`) that W2a owns. Do NOT edit those files. Report which typecheck errors are only "class does not implement new method" ones, so the orchestrator can confirm W2a closes them. Any other typecheck error must be fixed in your files.
- Do not commit.

Report back briefly: files changed, migration filename, gate results (`./scripts/check.sh server typecheck`, `client typecheck`, `core typecheck`), and the exact exported names/signatures you added (the GitClient methods and the PR-context contracts) so later workstreams can use them.