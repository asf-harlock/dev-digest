## Hand-back 1

## Security review: SPEC-10 Phase B (a4d69df..working tree, incl. untracked)

### Findings
| Severity | File:Line | Category | Input → sink | Exploit scenario | Suggestion | Confidence |
|---|---|---|---|---|---|---|
| none | | | | | | |

No finding has both a nameable attacker-controlled input and a reachable sink. Details below.

### Checked, nothing found
- **Tenancy (A01), `POST /eval-cases/:id/run`.** `routes.ts:253-272` takes `workspaceId` from `getContext` and passes it to `service.startCaseRun` (`service.ts:559`). Every lookup it reaches is workspace-scoped:
  - Case: `repo.getCase` (`repository.ts:401`) filters on `workspaceId` and `id`. A foreign-workspace case id gives 404, which covers EC-29.
  - Agent owner: `requireAgent` → `agentsRepo.getById(workspaceId, …)` (`service.ts:1069`).
  - Skill owner: `skillForRun` (`repository.ts:811`) filters on skill id and `workspaceId`.
  - Carrier: `requireAgent(workspaceId, carrierAgentId)`, then `carriersForSkill` (`repository.ts:830`, scoped on both the agent and the skill) and `carrierLinks` (`repository.ts:857`, scoped on both).
  - A foreign carrier id gives 404 or 422. The carrier id is only compared against workspace-scoped rows, so nothing is trusted from the client.
- **Optional body.**
  - `SkillEvalRunRequest` is `z.object({carrier_agent_id: z.string().uuid()})` (`vendor/shared/contracts/eval-ci.ts:180`).
  - The route (`routes.ts:256-260`) throws 422 whenever `req.body != null` and the parse fails. Absent or `null` body goes on with no carrier.
  - A body of `{}` or a non-UUID is therefore a 422. This is a hardening of the contract, not a hole.
  - Nothing from the body is spread into an insert. `carrier_agent_id` is used only as a lookup key.
- **409 `details.run_id` leak.** The 409 is raised in `insertRun` and `insertSkillRun` (`repository.ts:599-610`, `909-920`). `anyRunningRunId` (`repository.ts:~1180`) uses `ownerRuns(workspaceId, owner)`, which filters on workspace, owner kind and owner id. It returns only a run of the same owner in the same workspace. It is not scope-filtered, which is intended, and no cross-workspace run id can surface.
- **Abuse / cost.** `eval_runs_one_running_agent_uq` and `eval_runs_one_running_skill_uq` (`db/schema/eval.ts:120-125`) are keyed on `agent_id` / `skill_id` with `status='running'` and owner kind. They carry no `scope` predicate, so case runs and set runs share one single-flight slot per owner. A case run cannot bypass it. Concurrent starts get a 409. There is no rate limit beyond that, which is acceptable for a local-first tool and out of scope per the rubric.
- **Prompt injection (LLM01).**
  - Case runs go through the same `launchAgentRun` / `launchSkillRun` and the same `reviewFrozenCase` executor as set runs. No file under `server/src/prompts/` or `reviewer-core/` changed in this diff.
  - `toFrozenCase` (`helpers.ts:172`) copies only the stored `inputDiff`, title, body and expectation. The input is a case row from the caller's own workspace, so there is no new path from other PR text to the prompt.
  - Model output still goes through `scoreCase` and is only used as data.
  - The executor writes only `eval_runs` (`saveProgress`, `finalizeRun`). The `.insert(` / `.update(` calls in `service.ts` do not touch `reviews` or `findings`.
- **Logging, NFR-12.** `logIds` (`service.ts:~620`) carries `runId`, `ownerKind`, `agentId`, `agentVersion`, `scope`, `caseId` and `cases` only. The `info` and `error` calls in `service.ts` at 628, 632, 661, 666, 684, 687, 791, 796, 837-882 log those ids plus `status`, `durationMs` and `err`. `err` is `toErrorReason(...)`, which is a message cut to a one-line length. No diff, prompt, expectation, finding text or secret is logged. The residual risk is a provider error message echoing content. That is pre-existing, applies to set runs equally, and I rate it below 0.6.
- **SQL, `repository.ts`.**
  - The only raw fragments are `sql<string>\`${t.evalRuns.caseSet}->0->>'id'\`` at lines 735 and ~1103. Each interpolates only a Drizzle column reference and the literal path `'id'`. There is no user input in them.
  - The `caseIds` list reaches the query through `inArray(caseKey, [...])`, so the values are bound parameters. Those ids come from the workspace's own case rows.
  - `latestResultsByCase` and `newestCaseRunSources` are scoped by `ownerRuns(workspaceId, owner)`, and the second query by `workspaceId` plus `inArray(id, winners)`.
  - It reads scalar columns first, then jsonb only for the winning runs. It is bounded by one owner's runs.
  - `agentRuns` and `skillRuns` now filter `scope='set'`. Every new `runningCaseRun`, `anyRunningRunId` and `runningRun` carries `workspaceId`.
- **`compare` and `GET /eval-runs/:id`.** Both read `getRunRow(workspaceId, id)` (`repository.ts:~756`) and give 404 for a foreign or missing id. `compare` additionally gives 404 for a `scope='case'` run (`service.ts:1004-1013`). `getRun` returns only the caller's workspace data.
- **Migration 0025 and schema.** The migration is one statement: `ALTER TABLE "eval_runs" ADD COLUMN "scope" text DEFAULT 'set' NOT NULL;`. It is add-only and non-destructive. The schema enum is `['set','case']`.
- **Client XSS.**
  - A grep of `components/eval-case-editor`, `carrier-run-dialog` and `eval-case-row` finds no `dangerouslySetInnerHTML`, `innerHTML` or `window.open`.
  - `ResultBanner` renders `error_reason` as escaped JSX text through a next-intl `t()` value substitution, and `title` is a plain attribute.
  - `ActualOutputPane` puts finding text into a `<textarea readOnly value=…>`, which is never parsed as HTML.
  - The `Link` hrefs are built from server-supplied ids and a fixed prefix (`ownerEvalsTabHref`, `/repos/${repo_id}/pulls/${n}`). They are relative paths, so a `javascript:` URL is not possible.
  - Agent and carrier names in `carrier-run-dialog/RunDialog.tsx` render as React text.
- **Client hooks, `lib/api.ts`, `modal-width.ts`.**
  - `useStartEvalCaseRun` interpolates `caseId` into the URL path. `caseId` comes from server list data, not user input.
  - `detailsId` only reads a string field from the error details.
  - `modal-width.ts` is guarded with `useSyncExternalStore` and a server snapshot, so it is SSR-safe. It touches no secrets or storage.
- **Carrier dialog agent list.** The list comes from `overview.carriers`, which is produced by `carriersForSkill`, scoped to the workspace on both the agent and the skill. There is no cross-workspace data.
- **Secrets / SSRF / command injection.** The diff has no new `process.env` read, secret literal, outbound `fetch` or spawn. Not applicable.

### Already enforced by hard-rules.sh
- none (I did not run the script; this review found no `secret-literal` or `process-env-read` candidates in the changed files).

### Not checked
- Dependency CVEs (`pnpm audit` not run).
- Runtime behaviour: I did not run the app or the integration tests (`server/test/eval-case-run.it.test.ts`), and I did not exercise the 409/404 paths against a live database.
- Whether the unique index exists in applied databases. The index definitions are in the schema and an earlier migration, and 0025 only adds the column.
- The `reviewFrozenCase` / prompt internals, which are unchanged by this diff and were not re-audited.
- Test files, which are out of scope.

```findings-json
{
  "reviewer": "security",
  "findings": []
}
```