# Database schema

**Purpose:** How the Drizzle schema is organised and how tenancy is enforced.

**What belongs here:** domain split under `src/db/schema/`, the `workspace_id` rule, which tables are live in the starter vs staged for later lessons, migration workflow.

**What does not belong here:** anything already covered by the module `README.md`,
and anything volatile enough to go stale within a lesson or two.

Migrations-not-on-boot and seeding are covered in `README.md` ("Migrations are **not**
applied on boot") — this page only adds the schema rules.

## Domain split

Tables live in one file per domain under `src/db/schema/`. `src/db/schema.ts` is the
barrel: it `export *`s every domain file, and also builds the `schema` object that
`createDb` hands to `drizzle()` (`src/db/client.ts`). Consumers import from
`db/schema.js`, never from a domain file.

| File | Holds |
|---|---|
| `core.ts` | `users`, `workspaces`, `workspace_members`, `settings` |
| `repos.ts`, `pulls.ts`, `reviews.ts` | repos, PRs + files/commits, reviews/findings, PR intent/brief |
| `skills.ts`, `agents.ts`, `runs.ts` | skills (+versions), agents (+versions, skill links), agent/multi-agent runs, traces |
| `knowledge.ts`, `context.ts`, `repo-intel.ts` | memory/conventions, code chunks/symbols/references/onboarding, repo-intel index tables |
| `eval.ts`, `ci.ts`, `ops.ts` | eval/conformance/compose, CI, jobs/plugins/digests |
| `_shared.ts` | private helper `now()` (`created_at`, timestamptz, default now). Not re-exported — never import it from outside `schema/` |

## Adding a table or column

1. Edit the matching domain file. A new domain file must also be added to `schema.ts`
   (`export *`, the import, and the `schema` object) — `drizzle.config.ts` points at
   `schema.ts`, not at the directory. (`repo_convention_scans` is exported by the barrel
   but is not in the `schema` object — keep the three places in step for new tables.)
2. Names: snake_case in SQL, camelCase in the Drizzle key
   (`workspaceId: uuid('workspace_id')`, `repos.ts:9`). Timestamps use `now()` for
   `created_at`; ids are typically `uuid('id').primaryKey().defaultRandom()`.
3. `pnpm db:generate` (drizzle-kit, `strict: true`) writes `NNNN_<random_name>.sql`, a snapshot
   and a journal entry into `src/db/migrations/`. Commit all of it; keep the generated filename.
4. `pnpm db:migrate` (`src/db/migrate.ts`; needs `DATABASE_URL`) applies it. It also runs
   `CREATE EXTENSION IF NOT EXISTS vector` first. Integration tests build their DB from the
   same migrations via `runMigrations` (`test/helpers/pg.ts`), not from the TS schema.

Never edit an applied migration — change the schema and generate a new one.

## The `workspace_id` rule

- Resolve it in the handler with `getContext(container, req)` (`modules/_shared/context.ts:14`);
  it returns `{ workspaceId, userId }`. Under `LocalNoAuthProvider` that is always the default
  workspace, but the column and the scoping are still mandatory.
- Pass `workspaceId` into the service and filter on it in `repository.ts` — scoping is done by
  hand in each repository. The header of `src/db/schema.ts` mentions a "base-repository guard";
  no such guard exists anywhere under `src/` (grep for `base-repository`), so don't assume one.
- These tables carry `workspace_id` as `uuid NOT NULL → workspaces.id ON DELETE CASCADE`:
  `workspace_members`, `settings`, `repos`, `pull_requests`, `reviews`, `skills`, `agents`,
  `agent_runs`, `multi_agent_runs`, `memory`, `repo_convention_scans`, `conventions`,
  `code_chunks`, `eval_cases`, `jobs`, `installed_plugins`, `digests`.

### Scoped only through a parent FK (no `workspace_id` column)

Scope these by joining to the parent that has one; do not add a column without a reason.

| Table(s) | Parent FK |
|---|---|
| `pr_files`, `pr_commits`, `pr_intent`, `pr_brief`, `conformance_checks`, `composed_reviews` | `pr_id → pull_requests` |
| `findings` | `review_id → reviews` |
| `skill_versions`, `agent_versions`, `agent_skills` | `skill_id` / `agent_id` |
| `run_traces`, `agent_run_skills` | `run_id → agent_runs` |
| `symbols`, `references`, `onboarding`, `repo_index_state`, `file_edges`, `file_facts`, `file_rank`, `repo_map_cache` | `repo_id → repos` |
| `eval_runs` → `eval_cases`; `ci_installations` → `agents`; `ci_runs` → `ci_installations` | one hop further |
| `users`, `workspaces` | roots of the tree |

## Live vs staged

`README.md` states the schema holds **every** lesson's tables; unused ones sit empty.
Snapshot — tables never referenced as `t.<key>` outside `src/db/`: `memory`, `code_chunks`,
`eval_cases`, `eval_runs`, `conformance_checks`, `composed_reviews`, `ci_installations`,
`ci_runs`, `multi_agent_runs`, `installed_plugins`, `digests`. Everything else is used by a
module repository, route, `platform/jobs.ts`, an adapter or the seed. This drifts as lessons land — re-check with:

```sh
grep -rnE "\bt\.<tableKey>\b" src/modules src/platform src/adapters --include='*.ts'
```

Empty does not mean dead (root `CLAUDE.md`) — don't drop or rename them.

## Checklist

- [ ] Right `schema/<domain>.ts`, reachable through `schema.ts`; snake_case SQL, camelCase key
- [ ] New top-level table has `workspace_id` FK → `workspaces`; child table has a parent FK
- [ ] Repository filters on `workspaceId` from `getContext`
- [ ] `pnpm db:generate` output committed, `pnpm db:migrate` run; no applied migration edited
