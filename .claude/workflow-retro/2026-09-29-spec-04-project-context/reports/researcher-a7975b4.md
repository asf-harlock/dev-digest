## Hand-back 1

## Repository research: CI/runner path calling `reviewPullRequest`

### Findings
- **No second caller exists, now or in any commit.** The only non-test caller of `reviewPullRequest` in the whole history is `server/src/modules/reviews/run-executor.ts`.
- **An "agent-runner" (CI GitHub Action) is described but was never committed.** No `agent-runner/` directory, no `CiService`, and no `agentYaml` implementation exist on `main` or in any commit. Only references to them remain: comments, a `.gitignore` entry and specs. This is my reading of the evidence below, not something a single grep proves.
- **`.github/workflows/` is only this repo's own CI** (`client.yml`, `e2e-web.yml`, `reviewer-core.yml`, `server-integration.yml`, `server-unit.yml`). None of them run a review.
- **Skills and specs reach the runner by filesystem, per the design comments only.** No runner code exists to confirm this. The contract says the `AgentManifest` is read from `.devdigest/agents/<slug>.yaml` and `skills` are slugs resolved to `.devdigest/skills/<slug>.md`. It does not call the API.
- **The comment in `run.ts:26-27`** says "Skill bodies / memory / specs are RESOLVED strings here: the caller turns AgentManifest skill slugs into bodies (DB in the studio, fs in the runner)." `reviewPullRequest` does no I/O (no DB, GitHub or fs). The header (`run.ts:16-24`) says the server persists and streams SSE, while "runner posts + writes an artifact".
- **Specs have no runner-side source defined.** `ReviewInput` takes "Project-context spec chunks (untrusted; delimiter-wrapped downstream)" as already-resolved strings (`run.ts:~58-60`). `AgentManifest` has no specs field, only `skills`. In the server, the caller resolves specs.
- **Project-context docs would need to apply to the runner too, but by the same route.**
  - Docs attached through `reviewer-core`'s specs input would reach both callers automatically.
  - The runner would have to resolve them itself. The manifest has no place for them, and the runner has no DB or API access as designed.
  - A repo-file convention (for example under `.devdigest/`) is the natural fit, but nothing defines one yet.
  - `specs/03-intent-layer.md:101` and `:372` say the same about `intent`: it is "available to [the runner] for free", but wiring it through a CI entry point is out of scope and would be a separate task.

### Evidence
- `server/src/modules/reviews/run-executor.ts:3` imports `reviewPullRequest`. Line 217 is the call `await reviewPullRequest({`.
- `reviewer-core/test/run.test.ts` — the only other callers, all tests.
- `reviewer-core/src/review/run.ts:16-28` — the doc comment quoted above.
- `server/src/vendor/shared/contracts/eval-ci.ts:145-150` — the comment: "The studio (`CiService.agentYaml`) WRITES this shape to `.devdigest/agents/<slug>.yaml`; the agent-runner READS it… `skills` are slugs resolved to `.devdigest/skills/<slug>.md`." The schema is at lines 152-169 (`name`, `provider`, `model`, `system_prompt`, `skills`, `strategy`, `ci_fail_on`).
- `.gitignore:3-6` — "agent-runner ships as a JS GitHub Action — its bundled dist/ MUST be committed", with `!agent-runner/dist/`.
- `reviewer-core/package.json:6` — "Consumed by server (local reviews) and agent-runner (CI) as source via tsconfig path alias."
- `specs/03-intent-layer.md:101` and `:372` — the CI-runner wiring is listed as out of scope.
- `git log --all -- 'agent-runner/*'` returns nothing.
- `git grep` at `587c46a` for `agentYaml`, `agent-runner` and `.devdigest/skills` in non-markdown files hits only the comments and `.gitignore` above.
- `git log -S'AgentManifest' --all` returns `587c46a`, `93119a5`, `641b637`, `c6af1e4` and `93a456e`.
  - `587c46a` is the squashed snapshot that introduced `AgentManifest`.
  - The other four only touch it incidentally. I did not `git show` each one, but the path-filtered searches above rule out any runner code.
- `git log -S'reviewPullRequest' --all` returns `587c46a`, `84e2c1e`, `56e3eb7`, `c6af1e4`, `df27b87`, `ec27aff` and `06d8a79`. These hits are `run-executor.ts` at `587c46a`, plus `INSIGHTS.md`, `docs/specs/skills.md` and reviewer-core changes in the rest.
- `client/CLAUDE.md:51` — the client's vendored `shared` copy is missing `AgentManifest`.

### References
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/reviews/run-executor.ts`
- `/Users/harlock/Downloads/Sites/devdigest/reviewer-core/src/review/run.ts`
- `/Users/harlock/Downloads/Sites/devdigest/server/src/vendor/shared/contracts/eval-ci.ts`
- `/Users/harlock/Downloads/Sites/devdigest/specs/03-intent-layer.md`
- `/Users/harlock/Downloads/Sites/devdigest/.gitignore`

### Could not find
- Any `agent-runner` source, action entry point (`action.yml`, `dist/`), or `CiService` implementation, on `main` or in any commit.
- Any filesystem-reading code for `.devdigest/skills` or `.devdigest/agents`. The fs behaviour rests only on the contract comment and the `run.ts` comment.
- A defined mechanism for delivering project-context specs to a CI runner.
- Unmerged fork branches (homework) could contain more. `--all` covered only local and remote refs in this clone.