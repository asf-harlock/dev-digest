Plan the approved spec `specs/11-export-to-ci.md` (SPEC-11, Status: approved) in repo ~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci (branch l07-lab-export-to-ci). Reply in Ukrainian; paths/code/IDs in English.

Context:
- The user approved the spec as written, including the default of every open question Q-1..Q-14 (e.g. Node 22, reuse `devdigest/ci` branch as-is, one-line `source` filter in `skills/repository.ts` countRunsByAgents, commitFiles timeout 120 s). Treat these defaults as decided unless you find a concrete contradiction with code.
- Permissions granted by the user: edit both vendor copies of `@devdigest/shared` contracts; a new migration via `pnpm db:generate`; add a GLOBAL section with CI Runs to `client/src/vendor/ui/nav.ts`. NOT granted: any edit inside `agent-runner/`.
- Prior art for reference (read-only, do not copy blindly): `upstream/full-functionality` branch has a previous implementation (SPEC-14 there) — `git show upstream/full-functionality:server/src/modules/ci/{constants,workflow,bundle,ingest,service,refresh,routes,targets,repository}.ts`, `.../server/src/adapters/github/octokit.ts` (listWorkflowRuns/listRunArtifacts/downloadArtifact), `.../client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/`, `.../client/src/app/ci-runs/`, `.../client/src/lib/hooks/ci.ts`. Use it to speed up planning and to cite reusable pieces.
- Q-13 (pinned action SHAs) is owned by you: either resolve it or plan a step that does.
- Q-2 (standalone run of the copied runner dir) is unverified: plan an early verification step (build agent-runner in a scratch copy, copy dist/ to an empty dir, run `node index.js` on Node 22) as a gate before the server bundle code depends on it.

Follow your two-phase process: first reply = requirements review of the spec + only genuinely blocking questions (the spec already answers most), and ask single- vs multi-agent execution mode. Keep it short if the spec is clean.

---
## Resume 1

User answers (from the user, via the question form):
- Q1: yes — `cd server && pnpm add yaml@^2.6.1` (lockfile changes only through pnpm).
- Q2: option (b) — store `manifest_slug` on the installation from the first export and reuse it on Update.
- Q3: contracts package approved as you proposed (both copies; `base` removed, taken from repos.default_branch).
- Q4: vendored GitHub port edit approved (server `adapters.ts` + `mocks.ts`: listWorkflowRuns, listRunArtifacts, downloadArtifact; commitFiles reports whether the tree changed).
- Q5: approved — hand-edit the freshly generated, not-yet-applied migration (nullable → backfill workspace_id from agents → SET NOT NULL; delete ci_runs with no installation; duplicate check before unique index).
- Non-blocking 6–11: no objections — use your defaults (incl. Q-13 SHAs resolved to the v4 line, and the `scripts/e2e.sh` agent-runner build step).
- Execution mode: multi-agent.
Still NOT granted: any edit inside `agent-runner/`. Keep W0 (standalone runner gate) as a hard stop before code depends on it.

Write the Implementation Plan now and save it to `.claude/sdd/SPEC-11/plan.md`. Reply with the path, a short summary of work packages/order, and anything left open.