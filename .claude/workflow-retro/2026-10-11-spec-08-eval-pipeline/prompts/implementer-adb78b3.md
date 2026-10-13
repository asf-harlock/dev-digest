Execute `.claude/sdd/SPEC-08/plan.md` (repo root /Users/harlock/Downloads/Sites/devdigest). Spec: `specs/08-eval-pipeline.md`.

You are workstream W1 of a multi-agent run. Steps 1–4 only. Files owned:
- `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts` and `client/src/vendor/shared/contracts/{knowledge,eval-ci}.ts` (plus their `index.ts` re-exports only if a removed/added symbol requires it)
- `server/test/contracts.test.ts`
- `server/src/db/schema/eval.ts`, `server/src/db/rows.ts`
- `server/src/db/migrations/**` — NEW files produced by `pnpm db:generate` only; never hand-edit.
Run only the inner loop.

Notes / user authorisations:
- The user explicitly authorised editing both `vendor/shared` copies in this run (same change in both; client copy uses `.optional()` where server uses `.default()`, but the plan's new shapes have no defaults).
- Migrations: two passes exactly as steps 3 and 4 say (`cd server && pnpm db:generate < /dev/null` after each). If the generator prompts about a rename, stop and report. Do NOT run `db:migrate` — the orchestrator asks the user.
- Enumerate every contract field listed in step 1; downstream workstreams start only after you finish, against these exact fields.
- Do not touch anything outside your files. Gates for you: `cd server && pnpm typecheck`, `cd client && pnpm typecheck`, `cd server && pnpm exec vitest run test/contracts.test.ts`. Note: typecheck may surface stale references to removed `Eval*` symbols only in files you own or index re-exports; if a file outside your ownership breaks, report it rather than editing it.

Return: files changed, generated migration filenames, gate results, any deviation from the plan.