## Hand-back 1

## Security review: SPEC-08 eval pipeline (`git diff 13a8392` plus untracked files, `.swp` ignored)

### Findings
| Severity | File:Line | Category | Input → sink | Exploit scenario | Suggestion | Confidence |
|---|---|---|---|---|---|---|
| none | | | | | | |

No finding on this diff reaches 0.6 confidence with a nameable attacker input and sink.

### Checked, nothing found
- **Tenancy (A01).** Every query in `server/src/modules/eval/repository.ts` filters on a workspace.
  - `eval_cases` and `eval_runs` carry `workspace_id`. All reads, updates and deletes go through `agentCases` (l.508), `agentRuns` (l.516), `runningRun` (l.525) or an explicit `eq(workspaceId)`. This covers `getCase`, `renameCase`, `deleteCase`, `getRunRow`, `saveProgress`, `finalizeRun` and the summaries.
  - `findingContext` (l.80-117) scopes `findings` through `reviews.workspace_id` and `repos.workspace_id`. The agent leftJoin is also scoped by workspace, so a foreign-workspace agent shows as `agent_missing`.
  - `caseSource` (l.221) and `caseLinks` (l.286) scope through `reviews.workspace_id`. `caseLinks` also filters `eval_cases.workspace_id`, and `EvalService.caseLinks` calls `pullExists(workspace, pull)` first.
  - `prFiles(prId)` (l.121) has no workspace filter itself. Its only caller (`service.ts:loadRawDiff`) passes `ctx.pull.id` from the already-scoped `findingContext`.
  - Compare: `service.ts` `compare` loads both runs through `getRunRow(workspaceId, …)`, so a run from another workspace is a 404. It then requires `rowA.agentId === rowB.agentId` (422 otherwise) and finished status.
  - Agent delete: `AgentsService.delete` runs `evalRepo.deleteByAgent(workspaceId, id, tx)` inside the same transaction as the agent delete. Both deletes are workspace-scoped, and the case delete is also filtered by `ownerKind='agent'`.
  - `reapRunning()` (l.370) is deliberately unscoped. It runs at boot only and is not reachable from a route.
  - The unique index `eval_cases_source_finding_uq` is global rather than per-workspace. This is not exploitable, because `findingContext` has already proved the finding belongs to the caller's workspace.
- **Secrets (A04).** No `process.env` use or secret literal in the eval module, the eval client code or `client/src/test/eval-fixtures.ts`. The LLM is obtained through `container.llm(snapshot.provider)` (`service.ts`). Test fixtures use only `sk_live_xxx`; `frozen-input.test.ts:162` asserts no realistic key body.
- **Command injection.** The eval module spawns nothing. `loadRawDiff` calls the existing `container.git.diff(repo, ctx.pull.base, ctx.pull.headSha)`, which passes `${base}...${head}` as a single argv element in `simple-git.ts:123`. These values come from DB rows and are the same call the live review path makes.
- **SSRF.** No outbound fetch is added.
- **XSS (A05).** No `dangerouslySetInnerHTML`, `innerHTML` or Markdown rendering in any new eval client file. Case names, titles, `input_diff`, prompt diff lines and `error_reason` render as JSX text (`PromptDiff.tsx` comments that it never uses Markdown or innerHTML). `error_reason` goes through next-intl interpolation as a plain argument, not `t.rich`. All new `href`s are fixed prefixes plus a UUID or number: `agentHref` uses `encodeURIComponent`, and `CaseBody.tsx:73` uses `repo_id` and `pr_number`. The `fileHref` in `FindingCard.tsx` was not changed by this diff.
- **Prompt injection (LLM01).** `executor.ts` calls the shared `reviewPullRequest` engine. The frozen body goes through `prDescription`, which `prompt.ts:183-196` truncates and wraps with `wrapUntrusted`. The frozen diff goes through `wrapUntrusted('diff', …)`, and `INJECTION_GUARD` is applied. No repo-intel, context, memory or spec inputs reach the model. Model output arrives as schema-validated, grounded findings. It is used only for scoring and storage, never as a path, URL or command. The frozen title is interpolated into the task line (`helpers.ts:69`), outside the wrapped region. The live path does the same thing (`reviews/helpers.ts:86`), so this is parity rather than a new defect.
- **error_reason leakage.** `toErrorReason` (`helpers.ts:92`) collapses to one line and caps at 300 characters. The adapter errors it can surface are fixed strings: `ConfigError` ("X_API_KEY is not configured") and `ExternalServiceError` ("structured output failed schema validation"). Raw SDK network messages could pass through, but I could not name a path that includes key material, so I did not report it.
- **SQL injection.** The only `sql` templates are `jsonb_array_length(${column})` in `summarySelection` and the schema's partial-index predicate. Neither has interpolated user data. Everything else is Drizzle-parameterised.
- **Input validation (A08).** Every route uses `IdParams` (`z.string().uuid()`) or `EvalCompareQuery` (both `a` and `b` are `.uuid()`). `PATCH` takes `EvalCaseRename` (`name` 1-80 chars) and passes only `req.body.name` to the DB. No body is spread into an insert or update. `insertCase` and `insertRun` use explicit column mapping.
- **Abuse (rate/DoS).** At most one running run per agent (partial unique index `eval_runs_one_running_uq`, 409 with the run id). Runs go case by case. Prompt diff degrades beyond 2000 lines (`PROMPT_DIFF_MAX_LINES`). Run summary lists are limited. There is no cap on cases per agent, which I judged to be local-first DoS or cost noise and did not report.
- **Logging (NFR-12).** `service.ts` logs ids, counts, status and duration only (`LOG.*`). The crash path logs the truncated `toErrorReason` text, never diff, body, prompt or finding text. `app.ts` logs only the reap count or `err.message`.

### Already enforced by hard-rules.sh
- none (no `secret-literal` or `process-env-read` hits in the changed files).

### Not checked
- Dependency CVEs (`pnpm audit` not run); `server/package.json` changed, but I did not inspect the added dependency.
- The `.it.test.ts` run against a live Postgres, and the migration SQL against a live database. I read migrations 0020 and 0021 statically.
- Raw provider SDK error strings at runtime (whether a provider echoes anything sensitive in a 4xx message).
- Pre-existing code not touched by this diff: `githubBlobUrl`, the git adapter and the LLM adapters.

```findings-json
{
  "reviewer": "security",
  "findings": []
}
```