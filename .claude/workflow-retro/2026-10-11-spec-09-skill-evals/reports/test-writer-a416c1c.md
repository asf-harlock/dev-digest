## Hand-back 1

## Test-writing report: SPEC-09 Phase A server tests (hermetic and Docker)

### Tests added/extended
Skills applied: backend bucket (onion-architecture, fastify-best-practices). Only test files were written; no source was touched.

- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/pasted-diff.test.ts` (new, 25 tests, hermetic)
  - Covers: 204,800-byte cap by UTF-8 bytes (EC-1), CRLF to LF (AC-46), header wrapping for hunks-only, `+++`-only and `---`/`+++` input (AC-6), `diff --git` multi-file paste choosing one file (AC-7, AC-10), `no_patch` and `range_outside_diff` (EC-2, EC-3), new-side numbering (AC-10), `diffUnchanged` echo rules (AC-14).
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/helpers.test.ts` (extended, +11 tests, 32 total)
  - Covers: `classifyEdit` for `in_place`, `replace` and `locked` (AC-14, AC-15, EC-6), echoed unchanged fields not counting as edits, EC-41 nulls for `must_not_flag`.
  - Also covers `effectiveExpectation`, `buildManualMeta` and `hasUpdateFields`.
- `/Users/harlock/Downloads/Sites/devdigest/server/src/modules/eval/service.test.ts` (new, 10 tests, hermetic)
  - Uses an in-memory repo stub and a Proxy container that records any access beyond `evalRepo`, `agentsRepo` and `git`.
  - NFR-1: create, in-place edit, replace, finding to skill case (and repeat), the list and read methods, and delete never touch an LLM or any other outside port.
  - EC-1 ordering: owner 404, then byte cap, then parsing. An oversize non-diff gives `frozen_diff_too_large`; the same garbage under the cap gives `no_patch`.
  - Also covers `case_input_locked`, replace giving a new id with `replaced_from_id` and the same `created_at`, and an empty PATCH giving 422.
- `/Users/harlock/Downloads/Sites/devdigest/server/test/eval-cases.it.test.ts` (new, 24 tests, Docker)
  - Covers: POST `/agents/:id/eval-cases` and `/skills/:id/eval-cases` (201, null `pr_number`/`repo_full_name`, null `source_finding_id`); CRLF multi-file paste; GET `/skills/:id/eval-cases` (newest first, `latest_result` null, no mixing with the agent list).
  - Covers: 404 for an unknown or other-workspace owner or case (EC-32, nothing stored).
  - Covers: 422 `frozen_diff_too_large`, `no_patch`, `range_outside_diff` and `validation_error`; 413 `payload_too_large` (EC-42).
  - Covers: PATCH in place (same id), the agent-tab `{name}` body, echoed fields staying in place, replace (new id, same `created_at`, `replaced_from_id`, old id gone), a failed replace leaving the old case intact, empty body 422, and `case_input_locked` for a finding-derived case while name and notes stay editable.
  - Covers: skill delete cascades its cases and leaves others (EC-23), plus a route-level NFR-1 check that the mock LLM gets no calls.
- `/Users/harlock/Downloads/Sites/devdigest/server/test/skill-eval.it.test.ts` (new, 17 tests, Docker)
  - Covers: GET `/findings/:id/eval-skills` (run order, only skills in the run, `has_case`/`case_id`, empty list for a run with no skills or no run, 404 across workspaces).
  - Covers: POST `/findings/:id/skill-eval-case` (201 then 200, `must_find` and `must_not_flag`, `finding_undecided`, `skill_not_in_run`, check order, 404s, invalid body 422, `no_patch` and `range_outside_diff`).
  - Covers: the race with 3 concurrent requests giving exactly one row and one id (EC-39).
  - Covers: an agent case and a skill case from the same finding coexisting, with the agent path still 409 and the skill path still 200 (EC-43), and two skills each getting their own case.
  - Covers: the skill delete cascade and the skill dropping out of the menu data (EC-23), plus an NFR-1 check.
- `/Users/harlock/Downloads/Sites/devdigest/server/test/eval.it.test.ts` was not edited.

Totals: 87 new or added server tests (25 + 11 + 10 + 24 + 17).

### Run result
- `./scripts/check.sh server related src/modules/eval/pasted-diff.ts src/modules/eval/helpers.ts src/modules/eval/service.ts`: PASS (107 passed).
- `cd server && pnpm exec vitest run src/modules/eval test/eval-contract-parity.test.ts`: PASS (137 passed across 9 files).
- `cd server && pnpm exec vitest run test/eval-cases.it.test.ts test/skill-eval.it.test.ts` (Docker): PASS (41 passed).
- `./scripts/check.sh server typecheck`: PASS. `./scripts/check.sh server lint` on all five test files: PASS.
- I did not run the full server unit suite.
- I did not touch the baseline failures or flaky tests (`skills-stats`, `skills.it` 404s, `context-run`, `onboarding-tour` B1).

### Findings (not fixed)
- No implementation bugs found. Every failure while writing was a mistake in my own fixture:
  - `INFO` is not a valid `Severity`; the enum is `CRITICAL | WARNING | SUGGESTION`.
  - Hunks-only paste takes the typed file path, so a missing file only gives `no_patch` with a full multi-file paste. With bare hunks and a typed file that is not in them, you get `range_outside_diff`. That follows the design, but it is worth knowing when reading UI-level error text.

### Out of scope
- Client: I skimmed the names of the implementers' tests for `helpers`, `CaseEditor`, skill `EvalsTab`, `SkillEvalMenu`, `skill-eval` hooks and `FileCard` `highlightRange`. They cover AC-5 to AC-19, EC-1 to EC-9, EC-29, EC-30, EC-33, EC-35 to EC-39 and EC-44. I found no Phase A gaps worth adding, so I wrote no client tests and ran no client suite.
- Phase B and C tests (scoring, arms, the D7 prompt-parity test, runner, trend chart) were not written, as instructed.
- `reviewer-core/` and `e2e/` are not covered by this agent.