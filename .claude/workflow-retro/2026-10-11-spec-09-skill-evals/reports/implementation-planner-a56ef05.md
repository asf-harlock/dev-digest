## Hand-back 1

## Requirements review: SPEC-09 Skill Evals (Case Editor, skill eval runs, metric trend)

**Read:** root `CLAUDE.md`, `server/CLAUDE.md`, `client/CLAUDE.md`, and the Decisions and Open Questions sections of root, `server/` and `client/` `INSIGHTS.md`. I also read `docs/architecture.md`'s pointers, `specs/08-eval-pipeline.md`, `routing.json`, the code in `server/src/modules/eval/*`, `server/src/db/schema/eval.ts`, `app.ts`, both vendored contract copies, and the client eval, skills and diff-viewer code. Upstream facts were checked with `git show upstream/full-functionality:<path>`.

### Source
`/Users/harlock/Downloads/Sites/devdigest/specs/09-skill-evals.md`. Header: `Status: draft`, `Supersedes: —`. SPEC-08 is not edited.

**Heads-up:** the spec is in `draft`. Please confirm I should plan from a draft (Q1).

### Upstream facts, verified firsthand
The upstream reference design is real and the core design matches. It is the `upstream/full-functionality` commits b782c2d, 063a72c and f5b298f, plus `specs/15-skill-eval-cases.md`.

| Spec claim | Result |
|---|---|
| Carrier agent with two arms, one review at a time | **Confirmed.** `executeSkillRun` runs `executor.runCase(carrier, withArm, …)` then `withoutArm`, case by case. |
| Skill under test spliced in at its link position, ignoring both enable gates (AC-24/25) | **Confirmed.** `buildArms` in upstream `executor.ts:106` is pure, and its with-arm is built from the without-arm. |
| `no_agent_linked`, `frozen_diff_too_large`, `expectation_not_grounded` | **Confirmed.** All three exist upstream, each as a 422. |
| 200 KB cap | **Confirmed, with a caveat.** It is `MAX_FROZEN_DIFF_BYTES = 200*1024` UTF-8 bytes (204,800), checked with `Buffer.byteLength` on the whole pasted diff. The spec says "KB" and never defines the unit. |
| A case errored in either arm is excluded from both arms and from every lift | **Confirmed.** `pairArms` rewrites it as errored in both arms. That also hides the healthy arm's real result and cost. |
| Run cost is null if either arm's cost is null | **Confirmed.** |
| Upstream has no skill trend series | **Confirmed.** There is a skill run list, a compare and a dashboard row, but no trend. |
| `GET /skills/:id/eval/estimate`, `POST /eval/skills/runs/all` | **Confirmed.** Both are upstream-only. |

**Mismatches and subtleties to be aware of:**
1. **Lift unit.** Upstream stores lift as a raw fraction (`with − without`, `liftOf`). Spec AC-30 matches that. NFR-9 defines `round(with·100) − round(without·100)`. These can differ by 1 pt after rounding. See Q4.
2. **Upstream has no edit or replace rule.** The 4-field edit rule, `case_input_locked`, `no_patch`/`range_outside_diff` on manual input, and file-section extraction with header wrapping are spec-original.
   - Upstream `createSkillCase` stores the pasted `input_diff` as is, plus one combined `expectation_not_grounded` check.
   - On this branch, `extractFileDiff` needs a `diff --git` marker. AC-6 also allows `+++`-only headers and AC-7 allows hunks only, so new parsing and wrapping code is required.
3. **The upstream migration claim is partly right.** `eval_runs` was reshaped earlier upstream.
   - 0026 is the only skill-specific migration. It is additive (`skill_version`, `carrier_agent_id`, `gates_bypassed`, `arm_without`) and it widens `eval_cases_source_finding_uq`.
   - Upstream numbers 0020–0026 collide with this branch's own `0020_eager_cassandra_nova` and `0021_strong_psynapse`. The spec is right that it is not a clean cherry-pick.
4. **Upstream persists `gates_bypassed` and warns when either enable gate is off (D8/AC-52).** SPEC-09 only warns on `injection_flagged` (EC-31). Imported skills land `enabled:false` because nobody has vetted them, so SPEC-09 can silently send an unvetted body to a provider. See Recommendation 6.
5. **Upstream reconciles stale `running` rows after 15 minutes.** This branch only reaps on boot (`reapRunning`, which already covers all owners), and EC-18 matches that.
6. **Upstream reuses the same route names for agents and skills (`/skills/:id/eval/*`, `/eval/runs/:id`).** SPEC-09 follows this branch's hyphenated style (`/skills/:id/eval-cases`, `/eval-runs/:id`). That is fine.

### Branch facts the spec does not state, which drive the design
- **`EvalRepository` is not owner-generic on this branch.** `agentCases`, `insertCase`, `deleteByAgent`, `caseLinks` and `caseCountsByAgent` hardcode `'agent'`.
- **`eval_runs` is agent-shaped.** It has `agent_id NOT NULL`, `agent_version NOT NULL`, and `eval_runs_one_running_uq` on `(agent_id) WHERE running`.
  - Storing the carrier in `agent_id` would break EC-15, because a carrier's own run would get a 409.
  - It would also break EC-22, because `deleteByAgent` would delete skill runs when the carrier is deleted.
  - It would also break NFR-5, because `recentRunSummaries` and the dashboard are not owner-filtered.
  - A migration is therefore required in Phase B, and every agent read needs an owner filter.
- **Phase A needs no migration.** `eval_cases.owner_kind` and `notes` already exist.
- **`GET /eval-runs/:id` has one response schema (`EvalRunDetail`).** A skill-run shape means a union or discriminator. The client polls this route.
- **`PATCH /eval-cases/:id` currently takes `{name}` only.** It is used by the agent tab's rename form, so it must stay backward compatible.
- **The client cannot import across routes.** `dependency-cruiser` has `no-cross-route-private-component`. The reusable eval UI (`CaseModal`, `DeleteCaseDialog`, `CaseStateLabel`, `MetricTrend`) sits under `app/agents/**` and `app/eval/**` `_components`, so the skill tab cannot import it. The kit's `LineChart` also cannot show gaps or point deltas (`client/INSIGHTS.md`).
- **`DiffViewer` highlights a single `highlightLine`.** AC-8 needs a start–end range, so a prop must be added (`DiffViewer`/`FileCard`).
- **Fastify `bodyLimit` is 1 MiB.** A paste over 1 MiB gets a 413 before the 422 `frozen_diff_too_large` that EC-1 expects.
- **`drizzle-kit generate` prompts on rename-looking edits** (`server/INSIGHTS.md`). Add columns in one pass and make nullability changes in another.

### Requirements as given
Rows quote the key phrase. Clear rows are grouped by ID range to keep this readable; every ID is accounted for.

| # | Requirement (key phrase) | Source | Status | Note |
|---|---|---|---|---|
| AC-1 | "Eval cases", **Run all evals**, **+ New eval case** | 09:124 | Clear | |
| AC-2 | "{passed} / {scored} passing … with-skill arm of latest finished run" | 09:125 | Ambiguous | "Finished" is never defined (completed and partial, not errored). "Scored" in the with-arm alone or in both arms? See Q6. |
| AC-3 | each row: state icon + label, name, "expected n, got m" or `never run`, tag, file range, edit/delete | 09:127 | Ambiguous | If one arm errored, what does the with-arm column show? See Q6. Row click is unspecified. See Q8. |
| AC-4 | effect labels `helped` / `hurt` / `no effect · pass` / `no effect · fail` / `errored` | 09:128 | Missing detail | AC-31 defines four values, AC-4 shows a fifth, `errored`. The contract needs a decided enum. See Q6. |
| AC-5 | modal fields all empty except the type | 09:131 | Missing detail | Severity and category: required for `must_find`? Free text or enum? Max lengths for notes and description? See Q5. |
| AC-6, AC-7 | file choices from `diff --git` or `+++`; hunks-only gives a free-text path | 09:133–134 | Clear | The server parser must go beyond today's `extractFileDiff`. CRLF input is unspecified (non-blocking). |
| AC-8 | preview of the chosen file only, lines start–end highlighted on new-side numbers | 09:135 | Infeasible as stated | `DiffViewer` highlights one line only. The prop must be extended. See Recommendation 3. |
| AC-9–AC-12 | `POST /skills/:id/eval-cases` returns 201 with the owner and `source_finding_id:null`; stored section; `input_meta` nulls | 09:136–139 | Clear | The request body field names are not given. See contract coverage and Q9. |
| AC-13 | editor prefilled from the stored case | 09:141 | Clear | |
| AC-14 | name, notes, severity, category edited in place; id and latest result kept | 09:142 | Clear | `expectation.severity`/`category` live in the `expected_output` jsonb. |
| AC-15 | other edits create a new case and delete the old one in one transaction | 09:143 | Clear | The id changes, so the client must replace the row. |
| AC-16 | new case "in place of the old row" | 09:147 | Conflicting | AC-3 sorts newest first, so a replacement created now would jump to the top. See Q2. |
| AC-17, AC-18 | delete confirmation dialog naming the case, then delete | 09:145–146 | Clear | |
| AC-19 | "Created manually" in any case modal | 09:147 | Missing detail | Which modal on the skill tab? See Q8. |
| AC-20, AC-21 | run dialog lists the linked agents, preselects the latest carrier, shows "{n} cases · {2n} reviews" | 09:150–151 | Clear | Whether a disabled agent counts as a carrier is unspecified (non-blocking). |
| AC-22 | `POST /skills/:id/eval-runs` with `carrier_agent_id` returns 202 `{id,status}` | 09:152 | Clear | `EvalRunStart` is reused. |
| AC-23–AC-26 | snapshot of skill, carrier, both arms' skill lists, case set | 09:153–156 | Clear | `buildArms` is reusable. Tie handling on equal `order` is unspecified (non-blocking). |
| AC-27 | one review at a time, same prompt parity as SPEC-08 | 09:157 | Clear | Reuse `reviewFrozenCase(snapshot,…)` once per arm. |
| AC-28–AC-29 | SPEC-08 scoring on both arms, "over the cases scored in both arms" | 09:158–159 | Clear | |
| AC-30 | lift is the with-skill value minus the without-skill value of the same run | 09:160 | Ambiguous | NFR-9 gives a different integer-point formula. See Q4. |
| AC-31 | effect classification (four values) | 09:161 | Clear | |
| AC-32 | `completed`, `partial` or `errored`; `finished_at`; lifts stored | 09:162 | Clear | |
| AC-33 | disable the buttons; "Running case {k} of {n}" from polling | 09:163 | Missing detail | Needs persistence of per-case, per-arm progress. Is k = `cases_done + 1`? (plan decision, non-blocking) |
| AC-34 | on leaving `running`: refresh, `aria-live` announcement | 09:164 | Clear | |
| AC-35 | "Lift vs. without skill — recall {Δ} …" in signed points | 09:165 | Clear | Depends on Q4. |
| AC-36 | **Metric trend**, last 100 finished runs, x-axis `v{skill version}` | 09:168 | Clear | The kit chart cannot be used (gaps). A new SVG chart is needed. |
| AC-37–AC-39 | tooltip contents, Tab reachability, Escape closes | 09:169–171 | Clear | NFR-13 means the trend rows must be read from scalar or small columns, not the snapshot jsonb. |
| AC-40 | list items with `latest_result` (with state, without state, effect, with-arm counts) | 09:174 | Missing detail | Item shape is not specified. See contract coverage. |
| AC-41 | `GET /skills/:id/eval-overview` returns `{skill, cases_total, running_run_id, carriers, latest, previous, trend}` | 09:175 | Missing detail | The shapes of `skill`, `carriers` items and `latest` are not specified. |
| AC-42 | `GET /eval-runs/:id` returns the skill run's fields | 09:176 | Clear | Needs a discriminator on the shared route. |
| EC-1 | over 200 KB: 422 `frozen_diff_too_large` | 09:180 | Ambiguous | The unit is unspecified (the unit upstream actually uses is 204,800 bytes). A body over 1 MiB gets 413 first. |
| EC-2, EC-3 | 422 `no_patch`, 422 `range_outside_diff` | 09:181–182 | Clear | Existing codes. `freezeFileDiff` is reusable. |
| EC-4, EC-5 | 422 `validation_error` on bad lines and lengths | 09:183–184 | Clear | The global handler already emits this code. |
| EC-6 | `case_input_locked` for a case with a source finding | 09:185 | Ambiguous | The locked list omits severity and category. See Q3. |
| EC-7 | read-only Case Editor for finding-derived cases | 09:186 | Conflicting | No skill case can have a source finding, and the Case Editor is not on the agent tab. The path is unreachable. See Q3. |
| EC-8, EC-9 | discard confirmation; network error keeps the editor open | 09:187–188 | Clear | |
| EC-10 | run finishes from the input read at run start | 09:189 | Clear | |
| EC-11–EC-13 | no linked agent / unlinked carrier / no cases: disabled UI and 422 | 09:190–192 | Clear | The existing `no_eval_cases` text says "agent". A skill message is needed. |
| EC-14 | 409 `eval_run_in_progress` with the running run's id | 09:193 | Missing detail | Name the `details` key. Existing code uses `run_id`. See Q9. |
| EC-15 | skill run and carrier-agent run both proceed | 09:194 | Clear | Needs the schema change above. |
| EC-16, EC-17 | errored case excluded; all errored gives run `errored` | 09:195–196 | Clear | |
| EC-18 | on restart, `errored` with reason `interrupted` | 09:197 | Clear | Existing `reapRunning` already does this. |
| EC-19, EC-20 | 20-minute poll cap; poll failure shows Retry | 09:198–199 | Clear | |
| EC-21, EC-22 | snapshot rules; carrier deleted keeps the run | 09:200–201 | Clear | Store the carrier name in the snapshot. |
| EC-23, EC-24 | skill delete cascades to cases and runs; a running run stops quietly | 09:202–203 | Clear | There is no FK, so the delete is programmatic and transactional (mirror `AgentsService.delete`). |
| EC-25–EC-28 | null metric / lift / cost / trend gap | 09:204–207 | Clear | |
| EC-29, EC-30 | empty states | 09:208–209 | Clear | |
| EC-31 | injection-flag warning in the run dialog | 09:210 | Clear | |
| EC-32 | cross-workspace id gives 404 | 09:211 | Clear | |
| EC-33, EC-34 | truncation with `title`; duplicate names accepted | 09:212–213 | Clear | |
| NFR-1, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15 | zero LLM calls on reads; workspace scoping; no writes to review tables; frozen runs; i18n; WCAG; both vendor copies; generated migrations; logging; placeholder secrets; tests | 09:217–231 | Clear | NFR-5 is clear, but the response to `/eval-runs/compare` for a skill run id is unspecified. I will plan a 404 (non-blocking). |
| NFR-2 | "exactly two structured LLM review calls per case plus at most 2 re-prompts per call" | 09:218 | Ambiguous | Under `map-reduce` or `auto` a single `reviewPullRequest` can issue several model calls. I will interpret it as exactly two `reviewPullRequest` invocations per case (non-blocking). |
| NFR-9 | signed integer points `round(with·100) − round(without·100)` | 09:225 | Ambiguous | See Q4. |
| NFR-13 | 500 ms at 100 runs and 50 cases | 09:229 | Clear | Plan note: do not select `snapshot`, `case_set` or `case_results` jsonb for trend rows. |
| DIAG / CONTRACT | none in the spec | — | — | There are no diagrams or contract blocks. The contract field names below are my proposals. |

### Contract coverage
Both vendored copies differ only in unrelated blocks (`AgentManifest`, `CiFailOn`, one provider enum). Every eval edit can therefore be byte-identical in both.

| Requirement | Value shown or stored | Contract field | Type | Stored in | Gap |
|---|---|---|---|---|---|
| AC-11, NFR-10 | PR number and repo of a manual case | `EvalCaseMeta.pr_number`, `repo_full_name` | `.nullish()` | `eval_cases.input_meta` jsonb | No migration. `EvalCaseSource.pr_number` and the client PR link must tolerate null. |
| AC-9, AC-15, EC-1–5 | create and patch request bodies | new `EvalCaseCreate` / `EvalCaseEdit` (partial) | — | `eval_cases` columns and jsonb | Yes. The spec names only UI fields, so I propose names. See Q9. `EvalCaseRename` must stay valid for the agent tab. |
| AC-3, AC-4, AC-40 | per-arm state, effect, expected/got counts, never run | new `EvalSkillCaseListItem.latest_result` | state `passed\|failed\|errored` per arm; effect enum | `eval_runs` per-arm results | Yes. Effect needs an `errored` value or `null`. See Q6. |
| AC-2, AC-35 | passing count, lift | `latest.metrics.traces_passed / traces_total`, `lift` | | with-arm metric columns | Unit of lift unresolved. See Q4. |
| AC-23–25 | skill version, name and body; carrier id, name, version; provider, model, strategy, prompt; both skill lists | extend `EvalRunSnapshot` (nullish) plus a skill-run record | | new `eval_runs` columns and snapshot jsonb | Yes. Migration in Phase B. |
| AC-41 | `skill`, `carriers[]` | new `EvalSkillOverview` | `skill:{id,name,version,injection_flagged,…}`, `carriers:[{agent_id,name,…}]` | read from `skills` and `agent_skills`/`agents` | Yes. Shapes are not specified. `injection_flagged` is needed for EC-31. |
| AC-37, AC-38 | tooltip: date, skill version, carrier name and version, model, 3 metrics, 3 lifts, total cost | new `EvalSkillTrendPoint` | | scalar or small columns | Yes. The snapshot carries `system_prompt`, so store carrier name, model and lift outside it. |
| AC-42 | owner kind, skill version, both arms, lifts, per-case effects, `cases_done`, `cases_total` | discriminated `EvalRunDetail` (agent or skill) | | | Yes. Adding `owner_kind:'agent'` to the agent record is additive. |
| EC-11–14 | error codes | `no_agent_linked`, `no_eval_cases`, `eval_run_in_progress`, `frozen_diff_too_large`, `case_input_locked`, `validation_error` | | `EVAL_ERROR` constants | Add the three new codes. `eval_run_in_progress.details.run_id` stays, to match existing client code. |
| EC-31 | injection warning, and the gates-off warning (Recommendation 6) | `injection_flagged` (and optionally `skill_enabled`/`link_enabled`) | boolean | computed live | Optional. |

### Clarifying questions (blocking unless marked)
1. **[Status]** SPEC-09 is `draft`. Plan from the draft, or wait for `approved`? If you plan from it, any Phase 1 decision that changes wording needs a `spec-creator` update of the draft.
2. **[AC-16 vs AC-3]** A replacement case is a new row, so newest-first puts it at the top, not "in place". Should the replacement inherit the old case's `created_at` (stays in place), or is "top of the list" fine? If the latter, AC-16 needs rewording.
3. **[EC-6, EC-7 vs Non-goals]** Skill cases are manual only, and the Case Editor is not on the agent tab. So the finding-derived read-only Case Editor (EC-7) is unreachable in the product. EC-6's locked list also omits severity and category, while your Goals line says "finding-derived cases are name+notes only". Choose one:
   - (a) Implement the server rule only (EC-6, with severity and category locked, and `PATCH` still accepting `{name}`), and drop the EC-7 UI from this slice.
   - (b) Also build the read-only editor mode, although nothing opens it.

   I recommend (a), which needs a spec update.
4. **[AC-30 vs NFR-9]** What does the contract store for lift? I recommend storing the raw fraction `with − without` (AC-30 and upstream), plus both arms' metrics. The client then derives signed points as `round(with·100) − round(without·100)` (NFR-9) from the two values. That needs only a clarifying line in the spec that NFR-9 is display-time. The alternative is storing integer points and rewording AC-30.
5. **[AC-5, AC-3]** Case Editor details:
   - Are severity and category required for `must_find`?
   - Do they use the Finding severity and category enums, or free text?
   - What does the tag show when they are empty, and are they shown or editable for `must_not_flag`?
   - What are the max lengths for notes and description (UI-9 says "within limits" but defines none)?
6. **[AC-2, AC-3, AC-4, EC-16]** Four related decisions:
   - Is the effect enum five-valued (`…`, `errored`), or null when either arm errored?
   - Do we store the upstream way (a case errored in either arm becomes errored in both, hiding the healthy arm's result and cost), or keep the healthy arm's real result and flag it as excluded?
   - Does "scored" in AC-2 mean scored in both arms?
   - Is "finished run" = `completed` or `partial`? I recommend yes.
7. **[Do-not-touch list, NFR-10, NFR-11]** Please confirm explicit sign-off for two things:
   - Editing `server/src/vendor/shared/contracts/*` and `client/src/vendor/shared/contracts/*` (the "Do not touch" list says edit `*/src/vendor/**` only on an explicit request).
   - Generating new migration(s) in Phase B with `pnpm db:generate` (no applied migration is edited).
8. **[AC-8, AC-19, arch rule]** Three client decisions:
   - May I move the shared eval pieces (`CaseModal` parts, `DeleteCaseDialog`, `CaseStateLabel`) out of the agent tab into `client/src/components/`, with no behaviour change to the agent tab? Otherwise duplicate them. This touches agent-tab files that the spec calls out of scope.
   - May I add a range-highlight prop to `DiffViewer`/`FileCard`?
   - What does a skill-tab row click do: open the read-only case modal (where AC-19 "Created manually" applies), open the editor, or do nothing?
9. **(non-blocking) Contract names.** Confirm I should propose the request and response field names myself:
   - A create body such as `{name, pr_title, pr_description|null, diff, file, expectation_type, start_line, end_line, severity|null, category|null, notes|null}`.
   - A partial edit body of the same fields.
   - `details.run_id` on the 409.
   - The overview `skill`, `carriers[]` and `latest` shapes.

   The spec uses UI wording only, so no field-name wording conflict exists.
10. **(non-blocking) Smaller points I will plan as stated unless you object:**
    - 200 KB means 204,800 UTF-8 bytes.
    - The client pre-checks size, and the server per-route `bodyLimit` or 413 handler maps an oversize body to the same message.
    - CRLF input is normalised.
    - `/eval-runs/compare` returns 404 for a skill run id.
    - NFR-2 counts `reviewPullRequest` invocations.
    - AC-33's k is `cases_done + 1`.

### Recommendations (accept or reject)
1. **Reuse, do not rebuild.** Build two `EvalRunSnapshot`s (with and without the skill) and call the existing `reviewFrozenCase` once per arm. Port the pure upstream `buildArms`, `pairArms`, `classifyEffects` and `computeLift` into `scoring.ts`/`helpers.ts` after review. Cost: low; it keeps prompt parity (AC-27) by construction.
2. **Schema for Phase B.** Add to `eval_runs` `owner_kind` (default `'agent'`), `skill_id`, `carrier_agent_id`, `skill_version`, a without-arm results/metrics jsonb, and a lift. Make `agent_id` and `agent_version` nullable for skill runs.
   - Replace the single-flight index with two partial indexes: `(agent_id) WHERE running AND owner_kind='agent'` and `(skill_id) WHERE running AND owner_kind='skill'`.
   - Add an `owner_kind='agent'` predicate to every agent run read (dashboard, `recentRunSummaries`, compare, `listRunSummaries`).
   - Store carrier name, version and model in small columns or snapshot fields.
   - Why: EC-15, EC-22, NFR-5 and NFR-13.
   - Cost: medium. Run drizzle in two passes per `server/INSIGHTS.md`, and check the `eval_runs` row count before NOT NULL changes.
3. **Client structure.**
   - Put the Case Editor, a shared `DiffInputField` and the new trend SVG chart (with a gap-aware path) in `client/src/components/`.
   - Add a `highlightRange` prop to `DiffViewer`/`FileCard`.
   - Write a small pure parser for pasted diffs with `diff --git`, `+++`-only or hunks-only input.
   - Why: `no-cross-route-private-component`, AC-8, AC-36, and the kit-chart limits.
4. **Phase map**, each phase green and shippable:
   - **A (cases and Case Editor, no migration):** AC-1 (run buttons present but disabled until B), AC-3 (all rows `never run`), AC-5–AC-19, AC-40 (`latest_result` null), EC-1–EC-9, EC-29, EC-32–EC-34, NFR-10 (nullish contract), part of NFR-15.
   - **B (skill runner, list results, lift):** AC-2, AC-4, AC-20–AC-35, AC-41–AC-42, EC-10–EC-28, EC-30, EC-31, NFR-2, 4, 5, 6, 11, 12, 13.
   - **C (trend):** AC-36–AC-39, EC-28.
5. **Add a D7-invariant test.** A hermetic test, using the `assembly` that `executor.ts` returns, that the two arms' prompts differ only by the skill block. The spec states the invariant but only AC-27 backs it.
6. **Warn when either enable gate is off.** Upstream's AC-52 does this and SPEC-09 only covers `injection_flagged`. Add `skill_enabled` and `link_enabled` to the carrier item (computed live, no storage) and show the warning in the run dialog. Cost: low. It needs a one-line spec addition if you accept it.

### Per-file skills (from `routing.json`)
| Path / area | Bucket | Skills | Gates |
|---|---|---|---|
| `server/src/vendor/shared/contracts/*`, `client/src/vendor/shared/contracts/*` | contracts | zod, typescript-expert | server, client, core typecheck |
| `server/src/db/schema/eval.ts` | db-schema | drizzle-orm-patterns, postgresql-table-design, onion-architecture | server typecheck, arch, test-unit |
| `server/src/db/migrations/**` (generated, Phase B) | db-migrations | drizzle-orm-patterns, postgresql-table-design | server typecheck |
| `server/src/modules/eval/*`, `skills/*`, `agents/service.ts` | backend | onion-architecture, fastify-best-practices, zod, security, typescript-expert (plus drizzle-orm-patterns for `repository` files) | server typecheck, lint, arch, test-unit |
| `client/src/{app,components,lib}/**`, `client/messages/**` | frontend | frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert | client typecheck, lint, arch, test |
| `*.test.tsx` under `client/src` | frontend | the above plus react-testing-library | |

### Execution mode
**Recommendation: multi-agent, run phase by phase** (A, then B, then C).
- Within each phase: one `implementer` first for the contracts in both vendor copies, in one commit.
- Then the server and client workstreams in parallel. They own disjoint files and meet at the fixed contract.
- Then `test-writer`, then `architecture-reviewer` ∥ `security-reviewer` ∥ `plan-verifier`.
- Why not a single agent: the contract-first split and the disjoint server and client files make parallel work safe.
- The phases themselves stay sequential, because Phases B and C share `service.ts`, `repository.ts` and `helpers.ts` with A.
- Single-agent per phase is a reasonable fallback if you prefer fewer moving parts.

**Which mode do you want, single-agent or multi-agent?**

Awaiting answers to Q1–Q8 and the execution mode before writing the Implementation Plan.

---

## Hand-back 2

## Implementation Plan: SPEC-09 Eval Case Editor, skill eval runs and metric trends

I re-read the revised `specs/09-skill-evals.md` (committed d58c7a8) before writing this plan, and re-verified the code the new scope touches. After you approve the plan, run `/run-plan`. I have not launched any implementers.

### Objective
Ship SPEC-09 in three phases, each green on its own:
- **Phase A:** a shared Case Editor for agent and skill eval cases, plus finding → skill case.
- **Phase B:** the skill eval runner (carrier agent, two arms, lift, effect).
- **Phase C:** the shared Metric trend chart with a tooltip on the agent tab, the skill tab and the dashboard detail page.

It serves US-1…US-5 and AC-1…AC-58 (full traceability at the end). Stretch items 1, 4, 5 are out of scope.

### Decisions from Phase 1
- Plan from the committed draft → yes.
- A replaced case inherits the old `created_at` (AC-15, AC-16, `replaced_from_id` in AC-47).
- Both owners now have finding-derived cases, so EC-6 and EC-7 are reachable: the Case Editor is read-only for them except name and notes, and severity and category are locked.
- Lift is stored raw (with − without as a fraction). Integer points are display-only, `round(with·100) − round(without·100)` (NFR-9).
- Severity and category are optional, use the Finding enums, apply only to `must_find`, and are null otherwise (EC-41). Notes ≤ 2000 characters, description ≤ 5000.
- The effect enum has five values, including `errored`. A case errored in either arm is errored in both (pairArms) and excluded from lifts. "Scored" means scored in both arms. "Finished" means `completed` or `partial`.
- Explicit consent given to edit both vendored contract copies in the same commit, and to generate migrations with `pnpm db:generate` (never editing applied ones). Migrations land in Phase A (widen the unique index) and Phase B (reshape `eval_runs`).
- Move `CaseModal` parts, `DeleteCaseDialog`, `CaseStateLabel` and `MetricTrend` to `client/src/components/` with no behaviour change to the agent tab (NFR-16). Add start–end `highlightRange` to `DiffViewer`/`FileCard`. A row click opens the Case Editor.
- I propose the contract field names, reconciled with the spec's Contracts block. The 409 details key is `run_id`.
- 200 KB means 204,800 bytes. The client pre-checks size and maps a 413 to the same message. CRLF becomes LF. `/eval-runs/compare` returns 404 for a skill run id. NFR-2 means two `reviewPullRequest` invocations per case. k = `cases_done` + 1.
- Recommendation 6 (warn when the skill or its link is disabled) is accepted as Q-17: planned.
- Execution mode → **multi-agent, phase by phase** (A, then B, then C). Within each phase: contracts first (both vendor copies, one commit), then server ∥ client, then `test-writer`, then `architecture-reviewer` ∥ `security-reviewer` ∥ `plan-verifier`.

### Modules affected
- `server/`: eval module, skills module (delete cascade), schema and migrations, `app.ts` (413 check). No `reviewer-core` or `e2e` changes.
- `client/`: shared eval components, agent and skill Evals tabs, dashboard detail page, FindingCard, hooks, i18n, DiffViewer.
- Contracts: both vendor copies (`server/src/vendor/shared/contracts/`, `client/src/vendor/shared/contracts/`) change in the same commit.
- `reviewer-core/` reads the server copy, so its typecheck is a gate on contract steps.

### Constraints
- Root `CLAUDE.md`: `@devdigest/shared` exists in two copies; change both in the same commit. Never edit applied migrations; use `pnpm db:generate`.
- Root `CLAUDE.md`: no lockfile edits; `server/` and `client/` use pnpm, `reviewer-core/` uses npm.
- Root `CLAUDE.md`: always scope through `getContext()`.
- `server/CLAUDE.md`:
  - routes = HTTP, service = logic, repository = all persistence, helpers = pure transforms, constants = every literal; no raw SQL or HTTP in a service.
  - Declare `schema.body`/`params`; do not hand-roll `Schema.parse(req.body)`.
  - Every handler starts with `getContext`.
  - Take dependencies from `container`.
  - Extra files are kebab-case modules.
- `client/CLAUDE.md`:
  - Every component is a folder with `<Name>.tsx`, `<Name>.test.tsx`, `styles.ts`, `constants.ts`, `helpers.ts`, `index.ts`.
  - Shared folders are kebab-case in `src/components/`.
  - Feature folders are PascalCase in `_components/`.
  - `fetch` is banned inside components; new endpoints get hooks in `lib/hooks/`.
  - All text goes through next-intl.
  - Branch on `ApiError.status`, never on message text.
- `client/.dependency-cruiser.cjs` rules `shared-does-not-import-app` and `no-cross-route-private-component` are why the shared eval UI moves to `src/components/`.
- `server/INSIGHTS.md` (Tool & Library Notes, 2026-10-11):
  - `drizzle-kit generate` stops to ask "created or renamed?" when columns are added and dropped in one run.
  - Split into passes and run `pnpm db:generate < /dev/null`.
  - NOT NULL columns without a default apply only to an empty table, so check row counts first.
- `server/INSIGHTS.md` (Decisions, 2026-09-20): `injection_flagged` is computed live from the body and never stored. The run dialog reads it from the skill DTO.
- `client/INSIGHTS.md`: kit charts cannot show gaps or point deltas, so the trend needs its own SVG, as `MetricTrend` already has.
- Root `INSIGHTS.md` (2026-10-11): the only prior eval implementation is `git show upstream/full-functionality:<path>`. `server/package.json` `verify:l06` names the eval test files.
- `server/test/eval-contract-parity.test.ts` compares the eval regions of both vendor copies byte for byte. The regions are:
  - `knowledge.ts`, from `// ---- Eval ----` to `// ---- Memory ----`.
  - `eval-ci.ts`, from the eval banner to the Compose banner.
  - All new eval contracts must live inside these regions.
- SPEC-09 NFR-16: existing agent-tab, dashboard and finding-card tests must pass without assertion edits, except assertions on behaviour SPEC-09 amends (see Risks).

### Skills the implementer will apply (from `routing.json`)
| Path / area | Bucket | Skills |
|---|---|---|
| `server/src/vendor/shared/contracts/*`, `client/src/vendor/shared/contracts/*` | contracts | zod, typescript-expert |
| `server/src/db/schema/eval.ts` | db-schema | drizzle-orm-patterns, postgresql-table-design, onion-architecture |
| `server/src/db/migrations/**` (generated only) | db-migrations | drizzle-orm-patterns, postgresql-table-design |
| `server/src/modules/eval/*`, `modules/skills/*`, `app.ts`, `server/test/*` | backend | onion-architecture, fastify-best-practices, zod, security, typescript-expert (+ drizzle-orm-patterns for `repository*` files) |
| `client/src/app/**`, `client/src/components/**`, `client/src/lib/**`, `client/messages/**` | frontend | frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert |
| `*.test.tsx` under `client/src` | frontend | the above + react-testing-library |
| PR page `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingCard/**` and `client/messages/en/prReview.json` | frontend | same as frontend |
| FindingCard server side (`modules/eval/routes.ts`, `service.ts`, `repository.ts`) | backend | same as backend |

### Step-by-step plan

#### Phase A — Case Editor for both owners, finding → skill case

A1. **[contracts]** Edit both vendor copies identically, inside the eval regions (AC-5, AC-9, AC-11, AC-14, AC-15, AC-45, AC-47, AC-49–AC-54, EC-5, EC-41, NFR-10). This is one commit and must touch both copies.
- `EvalCaseMeta.pr_number` and `repo_full_name` become `.nullish()`.
- `EvalCaseSource.pr_number` becomes nullish.
- Add `EvalCaseInput` (body of `POST …/eval-cases`):
  - `name` 1–80, `notes` ≤ 2000 nullish.
  - `input_diff: string`. The 204,800-byte cap is a service-level check, not a zod refine, because EC-1 demands the code `frozen_diff_too_large`, not `validation_error`.
  - `input_meta {title 1–200, body ≤ 5000 nullish}`.
  - `expectation {type, file 1–500, start_line int ≥ 1, end_line int ≥ start_line, severity/category nullish}` using the existing `Severity` and `FindingCategory` enums from `findings.ts`.
- Add `EvalCaseUpdate`: partial of `EvalCaseInput`, with `input_meta` and `expectation` as complete objects when present. It stays backward compatible with the agent tab's `{name}` rename body.
- Add `EvalCase.replaced_from_id` nullish.
- Add `EvalCaseEffect` (5 values) and `EvalSkillCaseListItem` (`latest_result` is null in Phase A).
- Add `EvalFindingSkills` and `SkillEvalCaseRequest`.
- Touches `server/src/vendor/shared/contracts/knowledge.ts`, `client/src/vendor/shared/contracts/knowledge.ts`, and `contracts/index` only if exports need updating. The existing `server/test/eval-contract-parity.test.ts` guards parity.

A2. **[server/db-schema + migration]** In `server/src/db/schema/eval.ts`, widen `eval_cases_source_finding_uq` to `(source_finding_id, owner_kind, owner_id)` (NFR-11, EC-43).
- Run `cd server && pnpm db:generate < /dev/null`. It is one pass: drop plus create index, no column change.
- Inspect the generated `0022_*.sql`, and do not edit it.
- The widened index cannot fail on existing rows. Rows with a NULL `source_finding_id` stay allowed.
- Touches `server/src/db/schema/eval.ts` and the generated `server/src/db/migrations/0022_*`, `meta/0022_snapshot.json`, `meta/_journal.json`.

A3. **[server]** Constants and error codes in `server/src/modules/eval/constants.ts` (EC-1, EC-6, EC-37, EC-5).
- New codes: `frozen_diff_too_large`, `case_input_locked`, `skill_not_in_run`. Existing: `no_patch`, `range_outside_diff`, `finding_undecided`.
- Limits: `MAX_DIFF_BYTES = 204800`, name 80, title 200, description 5000, notes 2000, path 500.
- Messages, `NOT_FOUND.skill`, and `LOG` entries.

A4. **[server]** New pure module `server/src/modules/eval/pasted-diff.ts` (AC-6, AC-7, AC-10, AC-46, EC-2, EC-3, UI-5, UI-8).
- Normalise CRLF to LF.
- Enforce the byte cap before any parsing.
- Split a pasted diff into per-file sections. It accepts `diff --git` headers, `+++`-only headers, and hunks-only input. For hunks-only it generates `diff --git`/`---`/`+++` headers from the file path.
- Build the chosen file's section (headers + every hunk).
- Run the grounding check by reusing `freezeFileDiff` and `groundFindings`, mapping to `no_patch` and `range_outside_diff`.
- Also extend `frozen-input.ts` only if sharing is cleaner. Do not change the semantics of `extractFileDiff` for the agent finding path.

A5. **[server]** Generalise `server/src/modules/eval/repository.ts` by owner (AC-9, AC-14, AC-15, AC-45, AC-53, AC-54, EC-10, EC-23, EC-39, EC-43, NFR-3).
- `insertCase` takes `ownerKind`, nullable `sourceFindingId`, `notes`, and an optional `createdAt`.
- Add an owner-aware `listCases`, `countCases`, `caseNames` and `casesForRun`. The agent behaviour stays identical.
- `getCaseBySourceFinding` gains an owner filter. The agent path keeps its 409 `eval_case_exists`. The skill path returns the existing case so the service answers 200.
- Add `updateCaseInPlace`: name, notes, and the severity/category inside the `expected_output` jsonb.
- Add `replaceCase(ws, oldId, values, tx)`: in one transaction, insert the new case with the old `created_at`, then delete the old one.
- Add `skillForEval(ws, id)`.
- Add `findingSkills(ws, findingId)`: `reviews.run_id` → `agent_run_skills` (workspace-scoped) → `skills`, in run order, with `has_case` and `case_id` for the skill.
- Add `deleteCasesBySkill`.

A6. **[server]** Pure helpers in `helpers.ts`:
- `classifyEdit(existing, update)` returns `in_place`, `replace` or `locked` (AC-14, AC-15, EC-6, EC-41).
- Manual `input_meta` builder.
- DTO additions (`replaced_from_id`, skill list item).
- When a case has `source_finding_id`, any changed diff, file, lines, type, title, description, severity or category gives `case_input_locked`; name and notes are allowed.
- Compare against stored values so that unchanged fields sent back by the client do not count as a change.

A7. **[server]** `service.ts` (AC-9, AC-11, AC-14, AC-15, AC-45–AC-47, AC-50–AC-54, EC-1–EC-6, EC-35, EC-37, EC-39, EC-43, EC-44, NFR-1, NFR-3):
- `createManualCase(ws, owner, input)`. Order: 404 owner → byte cap → pasted-diff checks → insert.
- `updateCase`. It replaces `renameCase` but accepts `{name}`.
- `listSkillCases`.
- `listFindingSkills`.
- `createFromFindingForSkill`. Order: 404 → `finding_undecided` → `skill_not_in_run` → existing case returns 200 → freeze with `no_patch`/`range_outside_diff` → insert. It reuses the SPEC-08 expectation, freeze, name and meta rules.
- `getCase` stays owner-agnostic and shows "Created manually" data. `latest_result` is null for skill cases in Phase A.
- No LLM or container provider is touched anywhere in this phase.

A8. **[server]** `routes.ts` (AC-9, AC-45, AC-47, AC-51, AC-53, AC-54):
- `POST /agents/:id/eval-cases` (201).
- `POST /skills/:id/eval-cases` (201).
- `GET /skills/:id/eval-cases`.
- `PATCH /eval-cases/:id` with an `EvalCaseUpdate` body and an `EvalCase` response (200).
- `GET /findings/:id/eval-skills`.
- `POST /findings/:id/skill-eval-case` (201 or 200).

A9. **[server]** `app.ts` (EC-42). Verify that Fastify's body-too-large error leaves the error handler as a 413 with a stable code, not a 500. Adjust the handler only if it does not. The server `bodyLimit` stays at 1 MiB.

A10. **[server]** Skills delete cascade (EC-23, Phase A part). `SkillsRepository.deleteById(ws, id, beforeDelete?)` mirrors `AgentsRepository.deleteById`. `SkillsService.delete` passes `(tx) => container.evalRepo.deleteBySkill(ws, id, tx)`. Phase A deletes cases only; Phase B adds runs. Touches `server/src/modules/skills/repository.ts` and `service.ts`.

A11. **[client]** Shared Case Editor and relocations (AC-5–AC-8, AC-12, AC-13, AC-19, EC-1, EC-4, EC-7–EC-9, EC-42, NFR-16, UI-3, UI-8):
- Add `highlightRange?: {start, end}` additively to `DiffViewer`, `FileCard` and `CodeLine` in `client/src/components/diff-viewer/`. `highlightLine` stays untouched.
- Move from `app/agents/[id]/_components/AgentEditor/_components/EvalsTab/_components/` into `client/src/components/`, without changing behaviour:
  - the `CaseModal` parts (`CaseBody`, `CaseNameForm`) become part of the Case Editor read-only mode;
  - `DeleteCaseDialog` and `CaseStateLabel` move as folders (kebab-case folder names).
- Their tests move with them, path changes only.
- New `client/src/components/eval-case-editor/` with a `CaseEditor` modal in create, edit-manual and edit-finding (read-only) modes.
  - Create mode fields: name, PR title, description, diff, file, type, lines, notes, and severity/category only for `must_find`.
  - It also shows "Created manually" or the source PR link, the latest result with duration and cost, the discard confirmation (EC-8), and the size pre-check (EC-1).
  - It uses escaped text and the diff preview with `highlightRange`.
- Pure parsing helpers live in the component's `helpers.ts` (new-side paths, chosen-file section, byte length via `TextEncoder`).

A12. **[client]** Hooks (AC-9, AC-12, AC-45, AC-47, AC-49–AC-52, AC-54, EC-9, EC-42):
- Extend `client/src/lib/hooks/eval.ts` with `useCreateAgentEvalCase`, `useUpdateEvalCase` and `useDeleteEvalCase`'s extra invalidations.
- Add a new `client/src/lib/hooks/skill-eval.ts` for `useSkillEvalCases`, `useCreateSkillEvalCase`, `useFindingSkills`, `useCreateSkillCaseFromFinding`. It is a new file so the workstreams stay disjoint.
- 422 `frozen_diff_too_large`, `no_patch`, `range_outside_diff`, `validation_error`, `case_input_locked`, `skill_not_in_run` and a 413 resolve as inline outcomes. Network errors and 5xx fall through to the global toast.
- A replaced case reorders nothing, since it inherits `created_at`; the hooks swap it by `replaced_from_id`.

A13. **[client]** Agent Evals tab (AC-43, AC-44, AC-45, AC-13, EC-45, NFR-16):
- Add **+ New eval case** next to **Run all evals**.
- Add an edit action before delete on every row.
- A row click opens the Case Editor.
- New EC-45 empty-state copy goes in new keys in `client/messages/en/eval.json`.
- Touches `EvalsTab.tsx` and `EvalCaseList.tsx` in the agent tab.

A14. **[client]** Skill Evals tab (AC-1, AC-3, AC-12, AC-13, AC-16–AC-19, EC-29, EC-30, EC-33, NFR-8):
- Replace the placeholder in `app/skills/_components/SkillEditor/_components/EvalsTab/` with a case list, **+ New eval case**, and edit and delete actions that open the shared dialog.
- Rows show the result state label, the name, "expected {n}, got {m}" or `never run`, the `SEVERITY · category` or `must not flag` tag, and `file:start-end`.
- **Run all evals** and **Run on evals** stay disabled in Phase A (the SkillEditor header button keeps its disabled state; update the tooltip copy in `skills.json`).
- Names and paths are truncated with a `title` attribute.

A15. **[client]** FindingCard (AC-48–AC-53, EC-35, EC-36, EC-44):
- Add `SkillEvalMenu` under `FindingCard/_components/SkillEvalMenu/`, after `EvalCaseButton` in the action row.
- It fetches `GET /findings/:id/eval-skills` once the card is expanded.
- It is disabled with the EC-35 or EC-36 tooltip.
- Skills with `has_case` show **In eval set**, linking to `/skills/:id?tab=evals`.
- Inline rejections reuse the SPEC-08 messages.
- Strings go in `client/messages/en/prReview.json`.

A16. **[client]** i18n for everything above in `client/messages/en/eval.json` and `skills.json` (NFR-7).

#### Phase B — Skill runner

B1. **[contracts]** Both copies, eval regions (AC-2, AC-4, AC-20–AC-35, AC-40–AC-42, NFR-9, NFR-10):
- `EvalLift`.
- `EvalSkillRunRecord`.
- `EvalSkillRunDetail`.
- `EvalAgentRunDetail` (today's `EvalRunDetail` plus `owner_kind: 'agent'`).
- `EvalRunDetail` becomes a `z.discriminatedUnion('owner_kind', [...])`.
- `EvalSkillOverview` with `carriers[]` items carrying `link_enabled` (see Risks).
- `EvalSkillTrendPoint`.
- `EvalSkillRunRequest`.
- Fill `latest_result` in `EvalSkillCaseListItem`.
- Update `server/test/contracts.test.ts` and the parity test as needed.

B2. **[server/db-schema + migrations]** Reshape `eval_runs`, in two passes per `server/INSIGHTS.md`:
- **Pre-check:** count `eval_runs` rows on the dev DB.
- **Pass 1, add columns only.**
  - `owner_kind` text enum not null default `'agent'` (backfills existing rows).
  - `skill_id`, `skill_version`, `carrier_agent_id`.
  - `carrier_name`, `carrier_version`, `carrier_model`, so the trend never reads the snapshot jsonb (NFR-13).
  - `skill_snapshot` jsonb (skill name, body and version; with-skill and without-skill lists).
  - `without_metrics` jsonb, `without_results` jsonb default `[]`, `lift` jsonb.
  - Run `pnpm db:generate < /dev/null` and inspect the output.
- **Pass 2, constraints.**
  - Drop NOT NULL on `agent_id` and `agent_version`.
  - Drop `eval_runs_one_running_uq`.
  - Add partial unique `(agent_id) WHERE status='running' AND owner_kind='agent'` and `(skill_id) WHERE status='running' AND owner_kind='skill'`.
  - Add a skill index `(workspace_id, skill_id, ran_at desc)`.
  - Run `pnpm db:generate < /dev/null` again.
- Reuse the existing columns for the with-arm: `snapshot` holds the carrier snapshot, `case_results` holds the with-arm outcomes, `metric_parts` and the recall/precision/citation columns hold the with-arm values, and `cost_usd` holds the total over both arms.
- Touches `schema/eval.ts` and the generated `0023_*`, `0024_*` plus meta files.
- Tell the user to run `pnpm db:migrate` (it never runs on boot).

B3. **[server]** Pure scoring and arms (AC-24, AC-25, AC-28–AC-31, EC-16, EC-25–EC-27, NFR-2):
- `scoring.ts`: port and review upstream's `pairArms` (errored in either arm → errored in both), `computeLift` (raw fractions, null if either side is null), `classifyEffects` (five values), and a total-cost helper (null if any arm of any scored case is null).
- New `arms.ts`: port upstream's pure `buildArms`. The with-arm is built from the without-arm; the skill under test is spliced in at its link position regardless of both enable flags. Decide and test tie behaviour on equal `order`.

B4. **[server]** Repository (AC-23, AC-26, AC-32, AC-40–AC-42, EC-14, EC-22, EC-23, EC-24, NFR-5, NFR-13):
- Add `owner_kind='agent'` to every existing agent run predicate. This covers `agentRuns`, `runningRunId`, `listRunSummaries`, `countFinishedRuns`, `recentRunSummaries`, `caseCountsByAgent`, the dashboard and compare. Existing agent behaviour is unchanged.
- New skill-run methods: `insertSkillRun` (409 `eval_run_in_progress` with `details.run_id`), `saveSkillProgress` (writes both arms' arrays together), `finalizeSkillRun`, `runningSkillRunId`, `listSkillRunSummaries` (scalar columns only), `latestFinishedSkillRunRow`, `carriersForSkill` (agents linked to the skill, workspace-scoped, with `link_enabled`), `deleteBySkill`.
- Reaping on boot is already owner-agnostic.

B5. **[server]** Service and routes (AC-20–AC-27, AC-32, AC-40–AC-42, EC-10–EC-24, EC-38, NFR-4, NFR-12):
- `startSkillRun`. Order: 404 skill and carrier → `no_agent_linked` (EC-11, EC-12) → `no_eval_cases` (EC-13) → insert with 409 (EC-14).
- Snapshot the skill and the carrier, build both arms, and read the cases once.
- Return 202, then run detached.
- `executeSkillRun`. Per case, review with the with-arm snapshot, then the without-arm snapshot, reusing `reviewFrozenCase`. Check `isRunning` before each review so a deleted skill stops with no LLM call and no error log (EC-24).
- Persist progress after each case. After the loop: `pairArms`, `scoreRun` per arm, lift, status via `finalStatus` (all errored → `errored` with null metrics and lifts, EC-17).
- `overview` for skills (carriers, `latest`, `previous`, trend ≤ 100).
- `getRun` returns the discriminated shape.
- `compare` gives 404 for a skill run (EC-38).
- `getCase` derives a skill case's `latest_result` (with-arm state; duration and cost summed over both arms).
- Routes: `POST /skills/:id/eval-runs` (202), `GET /skills/:id/eval-overview`, and `GET /eval-runs/:id` with the union response.
- Extend the skill delete cascade to runs (EC-23).
- Logging per NFR-12: ids, version, count, status, duration only.

B6. **[client]** Hooks and Skill Evals tab run flow (AC-2, AC-4, AC-20–AC-22, AC-33–AC-35, EC-11, EC-13, EC-19, EC-20, EC-31, Q-17, NFR-8, NFR-9):
- Extend `lib/hooks/skill-eval.ts` with `useSkillEvalOverview`, `useStartSkillEvalRun` (409 resolves with `run_id`) and `useSkillEvalRun` (2 s polling, 20-minute cap, Retry, finish refreshes overview, cases and trend).
- Keep the agent `useEvalRun` behaviour. Only its types narrow to `EvalAgentRunDetail`.
- Run dialog (carrier picker; "{n} cases · {2n} reviews"; injection warning; disabled-skill or disabled-link warning).
- Passing-count and lift lines (reuse `client/src/lib/eval-format.ts` for the NFR-9 points).
- Per-row effect and with/without states.
- "Running case {k} of {n}" and the `aria-live="polite"` final status.
- Wire the header **Run on evals** in `SkillEditor.tsx` to the same dialog. Add the disabled hints from EC-11 and EC-13.

#### Phase C — Metric trend

C1. **[contracts]** Both copies (AC-55–AC-58): add `cost_usd: number|null` to `EvalTrendPoint`.

C2. **[server]** Trend window and cost (AC-58, NFR-13):
- `TREND_LIMIT` goes from 30 to 100.
- `toTrendPoint` carries `cost_usd`.
- `overview` still reads scalar columns only.
- Check `GET /agents/:id/eval-overview` against the 500 ms budget with a seeded set of 100 runs and 50 cases.

C3. **[client]** Shared chart (AC-36–AC-39, AC-55–AC-57, EC-28, EC-30, NFR-8):
- Move `MetricTrend` from `app/eval/agents/[agentId]/_components/MetricTrend/` to `client/src/components/metric-trend/` and generalise it: points, series accessors, a tooltip text builder, a version label. Its helper tests move with it, path changes only.
- Every point is focusable with the Tab key. Its accessible name equals the tooltip text. Escape, blur and pointer-leave close the tooltip. A null point is a gap, not 0.
- Keep the dashboard detail page on the shared component with the AC-56 tooltip (version, date, three metrics, cost).
- Add the chart to the agent tab (AC-55, version `v{agent version}`).
- Add the chart to the skill tab (AC-36/AC-37: with-arm metrics, tooltip with date, `v{skill}`, carrier name and version, model, three lifts per NFR-9, total cost).
- Show "No runs yet" when there is no finished run (EC-30).

### Execution
Multi-agent, phase by phase (A, then B, then C). Each phase runs the same sequence:

| Workstream | Agent | Steps (A / B / C) | Files owned | Depends on | Parallel with |
|---|---|---|---|---|---|
| W1 contracts | implementer | A1 / B1 / C1 | both `contracts/knowledge.ts` and `contracts/eval-ci.ts` copies | — | — |
| W2 server | implementer | A2–A10 / B2–B5 / C2 | `server/src/db/schema/eval.ts`, generated migrations, `server/src/modules/eval/**`, `modules/skills/**`, `app.ts` | W1 | W3 |
| W3 client | implementer | A11–A16 / B6 / C3 | `client/src/app/**`, `client/src/components/**`, `client/src/lib/**`, `client/messages/**` | W1 | W2 |
| W4 tests | test-writer | see Test plan | `*.test.ts(x)`, `server/test/*` | W2, W3 | — |
| Review | architecture-reviewer ∥ security-reviewer ∥ plan-verifier | — | read-only | W4 | each other |

No file appears in two workstreams. The `eval.ts` hooks file belongs to W3 only, and the new `skill-eval.ts` is also W3. Any `server/package.json` edit (see Risks) is not part of the workstreams.

### Test plan
Commands, per package (pnpm in `server/` and `client/`, npm in `reviewer-core/`):
- `cd server && pnpm typecheck && pnpm lint && pnpm arch`
- `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` (hermetic)
- `cd server && pnpm exec vitest run .it.test` (needs Docker; DB-backed)
- `cd client && pnpm typecheck && pnpm lint && pnpm arch && pnpm test`
- `cd reviewer-core && npm run typecheck && npm test`: `reviewer-core` reads the server contract copy, so this gate runs after every contract step.

Tests to write (`test-writer`):
- **Hermetic, server:**
  - `pasted-diff.test.ts`: header wrapping for hunks-only input, `+++`-only input, multi-file paste, CRLF, the byte cap before parsing, `no_patch`, `range_outside_diff`, and new-side numbering.
  - Edit-rule tests: in place vs replace, `created_at` kept, `case_input_locked` including severity/category, EC-41 nulls.
  - Scoring: lift and effect for every null case, `pairArms`, cost rules (EC-27).
  - Arms tests: `buildArms` order, skill spliced at its link position regardless of flags, and the tie case.
  - **D7 prompt-parity test:** using the `assembly` returned by `reviewFrozenCase`, assert that the two arms' assembled prompts differ only by the skill block (AC-27).
  - NFR-1: a mock provider receives no call on create, edit, delete, finding → skill case, every read route, and scoring.
  - Contract parity and `contracts.test.ts` updates.
- **Integration (Docker):** new files `server/test/eval-cases.it.test.ts` and `server/test/skill-eval.it.test.ts`, so `eval.it.test.ts` stays unedited. They cover:
  - the new routes;
  - the 409 single-flight per skill, including EC-15 (carrier agent run and skill run proceed together);
  - workspace scoping and 404s (EC-32);
  - one case per owner and source finding, with race (EC-39, EC-43);
  - the NFR-5 agent-read exclusion (overview, cases, dashboard, compare);
  - `case_input_locked`;
  - skill delete cascade and EC-24;
  - NFR-4 (no writes to review tables) and NFR-6;
  - the NFR-13 timing check.
- **Client:**
  - `CaseEditor` tests (create, edit, read-only, discard prompt, inline errors, escaped rendering).
  - Pasted-diff helper tests.
  - A `highlightRange` test for `DiffViewer`/`FileCard`.
  - Skill tab and agent tab new-behaviour tests, in new test files.
  - `SkillEvalMenu` tests.
  - Run dialog, polling, Retry and timeout tests.
  - Trend chart tests (keyboard, tooltip text equals accessible name, Escape, gaps).
  - A 24×24 px target test and next-intl key coverage.
- **NFR-16 check:** the existing agent-tab, dashboard and finding-card tests must pass, with edits only to assertions on amended behaviour (see Risks).

### Traceability (requirements → steps)
- AC-1, AC-3, AC-14–AC-19, EC-29, EC-33: A14, A11.
- AC-2, AC-4, AC-20–AC-35, AC-40–AC-42, EC-10–EC-28, EC-38, EC-40: B3–B6.
- AC-5–AC-13, AC-46, AC-47, EC-1–EC-9, EC-41, EC-42: A1, A4–A9, A11–A12.
- AC-43–AC-45, EC-45: A13.
- AC-48–AC-53, EC-35–EC-37, EC-39, EC-43, EC-44: A5, A7, A8, A15.
- AC-54: A5, A8, A14.
- AC-36–AC-39, AC-55–AC-58, EC-28, EC-30: C1–C3.
- NFR-1, NFR-3, NFR-14, NFR-15: A5–A7 and all test items. NFR-2, NFR-4–NFR-6, NFR-12, NFR-13: B2–B5. NFR-7, NFR-8: client steps. NFR-9: B6, C3. NFR-10: A1, B1, C1. NFR-11: A2, B2. NFR-16: A11–A13, C3.
- UI-1–UI-12: A4, A7, B5, A11 (escaped rendering), and the security review.
- Diagrams: none in the spec.

### Risks / open questions
- **Spec Contracts block needs a `spec-creator` update before implementation (it is a draft).**
  - `EvalSkillOverview.carriers[]` has no per-link `enabled`. Q-17 (warn when the skill or its link to the chosen carrier is disabled) needs `link_enabled: boolean`. The plan adds it.
  - The block shows `input_diff` capped at 204,800 bytes in the contract, but I implement it as a service check returning `frozen_diff_too_large` (zod cannot return a different code).
  - For skill-owned cases, `GET /eval-cases/:id` `latest_result` is not in the block. I derive it from the with-arm state, with duration and cost summed over both arms.
- **NFR-16 vs amended SPEC-08 items.** `client/src/app/agents/[id]/_components/AgentEditor/_components/EvalsTab/EvalsTab.test.tsx` asserts behaviour SPEC-09 amends: the row-click read-only modal and rename (around line 201), "Source no longer available" (236), and the empty-state copy (132, EC-22 → EC-45). Those assertions must change; plan-verifier should treat them as expected edits and confirm nothing else changes. Moved files' tests change only by import path.
- **Agent run responses gain `owner_kind: 'agent'`** through the discriminated union. Existing server tests with exact-equality bodies (`eval.it.test.ts`) could break and need checking.
- **`agent_id` becomes nullable** for skill runs. Type narrowing ripples through `EvalRunRow`, `EvalRunSummary` and `toRunRecord`. All agent reads must filter by `owner_kind='agent'` (NFR-5).
- **Vendor and migration edits** are explicitly consented (`*/src/vendor/**` and `server/src/db/migrations/**` are on the root Do-not-touch list). Only generated migrations are created. `drizzle-kit` may prompt on a rename: stop and re-split the passes instead of answering. Check `eval_runs` row counts before pass 1. The dev DB needs a manual `pnpm db:migrate`.
- **pairArms loses the healthy arm's real result and cost** for a case that errored in the other arm, as upstream does. This matches EC-16, but the run cost excludes that spend.
- **Per-card fetch in the finding menu.** AC-48/EC-36 need the skills list before the menu opens, so each expanded card calls `GET /findings/:id/eval-skills` once.
- **A 413** reaches the client only if `app.ts` passes it through unchanged. Step A9 verifies this.
- **Optional, needs sign-off:** adding the new test files to the `verify:l06` script in `server/package.json` (a `deps`-bucket file). Not planned unless you ask.
- **Q-1 (spec size):** Phase A is large (editor, hooks, finding menu, two tabs, a migration). If plan review finds that Phase A cannot be verified on its own, split A into A1 (agent + skill editor) and A2 (finding → skill case).
- **Equal link `order`** in `buildArms` is unspecified. I will test and document the chosen tie behaviour.