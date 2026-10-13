## Hand-back 1

## Security review: SPEC-09 skill evals (diff vs eefc3a4 + untracked files)

### Findings
| Severity | File:Line | Category | Input → sink | Exploit scenario | Suggestion | Confidence |
|---|---|---|---|---|---|---|
| none | | | | | | |

No exploitable defect found where I could name both an attacker-controlled input and a sink. The checks below say what I traced.

### Checked, nothing found
- **Tenancy (A01).** Every new or changed query in `server/src/modules/eval/repository.ts` filters on `workspaceId`.
  - Case queries go through `ownerCases` (`workspace_id`, `owner_kind`, `owner_id`) at :1000. `getCase`, `updateCaseInPlace`, `replaceCase`, `deleteCase`, `getCaseBySourceFinding` and `caseNames` are all scoped this way.
  - Run queries are scoped as well. `skillRuns` (:1019) and `runningRun` (:1028) include `workspace_id`. `insertSkillRun`, `saveSkillProgress`, `finalizeSkillRun` and `getRunRow` are scoped. `deleteBySkill` (:681) filters on workspace, `owner_kind` and `skill_id`.
  - The multi-table joins each check `workspace_id` on the tables that carry it. `findingSkills` (:506-553) checks `reviews`, `agent_runs` and `skills`. `carriersForSkill` and `carrierLinks` check `agents` and `skills`. `findingContext` checks `reviews` and `repos`.
  - Cross-workspace ids in `skill_id`, `carrier_agent_id`, finding id and case id all resolve to 404. The checks are `skillForEval`, `skillForRun`, `requireAgent` and `carriersForSkill` (a carrier must be linked to the skill, `service.ts` :562-567).
  - `eval_cases.owner_id` has no FK, but `createManualCase` runs `requireOwner` first. The replace path reuses the stored `ownerKind` and `ownerId`.
  - The skill-delete cascade (`skills/repository.ts` :203-220) runs `beforeDelete` inside the transaction with the same workspaceId.
  - `reapRunning` is not workspace-scoped. That is pre-existing and boot-only.
- **Prompt injection (LLM01).**
  - The pasted PR body goes through `wrapUntrusted` (`reviewer-core/src/prompt.ts` :43, :196) and the diff through :213, so they are delimited as data and the INJECTION_GUARD is applied.
  - Skill names and bodies are rendered as trusted skill blocks (`skill-render.ts`). This is the same as the live review path.
  - The with-arm injects the skill under test even when its enable flag is off (`arms.ts` :44-56). The user picks that skill on purpose, the model has no tools, and its output is only parsed into findings and scored. Nothing the model returns is executed, used as a path, or used as a URL. I do not count this as a defect.
  - The frozen PR title is interpolated outside the untrusted block (`helpers.ts` :80-82, `evalTaskLine`). The live path does the same (`reviews/run-executor.ts` :261, `taskLine`), so this is pre-existing and not new here.
  - `notes` is not part of `casesForRun`, so it never reaches the prompt.
- **XSS (A05).** There is no `dangerouslySetInnerHTML`, `innerHTML` or raw-HTML markdown in the changed or new `client/` files.
  - `aria-label` and `title` values with case names, file paths and reasons are React attributes, so they are escaped. next-intl does not re-parse interpolated values.
  - The two new hrefs are `SkillEvalMenu.tsx` :116 and `CaseFacts.tsx` :25. They are built from server-issued UUIDs and a numeric `pr_number`, and cannot carry a `javascript:` scheme.
- **Input validation (A08).** Every new route declares Zod `params` (`IdParams`) and `body`. The bodies are `SkillEvalRunRequest`, `SkillEvalCaseRequest`, `EvalCaseInput` and `EvalCaseUpdate`, with uuid ids and max lengths on name, notes, title, body and file.
  - There is no body spread into an insert or update. `insertCase` and `updateCaseInPlace` list columns explicitly.
  - `input_diff` has no Zod cap, but Fastify's 1 MiB `bodyLimit` (`app.ts` :50) bounds it. The 204,800-byte service check runs before any parsing in both `createManualCase` (:207) and `updateCase` (:342, before `classifyEdit` and `diffUnchanged`).
  - The parsing is linear. The regexes in `pasted-diff.ts` and `frozen-input.ts` are anchored with single `.+` groups, and `diff-parser.ts` has no nested quantifiers. `pastedDiffPaths` uses `includes`, which is O(n²) in the number of distinct files, but its input is capped at 200 KB, so I treat it as not exploitable.
  - The 413 branch (`app.ts` :170-176) echoes Fastify's own fixed message, not user input. It also skips the error log, so no body is logged.
- **File path as a filesystem, git or shell argument.** `expectation.file` and the `+++`/`diff --git` paths are only used for string matching in `extractFileDiff`, `groundFindings` and `generated headers`, and are stored in jsonb. No `fs`, `spawn` or `git` call receives them.
  - A newline inside `fallbackFile` can forge extra header lines in the canonical diff (`pasted-diff.ts` :114). The only party who can do that is the local user, against their own case, so I did not report it.
  - `loadRawDiff` calls `git.diff` with DB-stored base and sha values. That code is pre-existing (SPEC-08) and the new `createFromFindingForSkill` route reuses it unchanged.
- **Secrets and log leakage (NFR-12).** The `LOG` messages and fields (`service.ts` :447, :454, :597-609) carry only ids, version, case count, status and duration. No diff, prompt or skill body is logged.
  - Per-run error reasons are one line and capped at 300 characters (`toErrorReason`). That is unchanged SPEC-08 behaviour.
  - There is no new `process.env` read and no secret literal.
- **CSRF and cross-origin abuse.** CORS is restricted to `config.webOrigin` (`app.ts` :100).
- **Abuse (6).** Single-flight is per skill, enforced by the partial unique index `eval_runs_one_running_skill_uq` (migration 0024). It is not per carrier or global, and there is no cap on cases per skill, so one skill run costs 2n LLM calls. I did not report it, because it is a rate-limit or DoS concern on a local-first tool with no auth and a CORS-restricted API, and the rules exclude that.

### Already enforced by hard-rules.sh
- none emitted for this diff. I did not run the script; I found no `sk-…`, `ghp_…`, PEM or `server/src` `process.env` read in the changed lines.

### Not checked
- Dependency CVEs (`pnpm audit` was not run).
- Runtime config, such as the deployed `webOrigin`.
- The `mcp/` package, which this diff does not change.
- The client test files and the `client/src/vendor/shared` copy (only compared against the server copy by contents in the diff).
- I did not run the `*.it.test.ts` tests (cross-workspace behaviour was verified by reading the queries, not by execution).

```findings-json
{
  "reviewer": "security",
  "findings": []
}
```