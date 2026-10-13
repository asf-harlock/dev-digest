## Hand-back 1

## SPEC-10 Phase A, pass 2 of 2 (delta matrix, saved to `/Users/harlock/Downloads/Sites/devdigest/.claude/sdd/SPEC-10/verify-2.md`)

**Verdict:** No Fail in Phase A. AC-25 moves from Fail (verify #1) to Pass (verify #1b), and the fix rounds did not break anything. AC-24, EC-11, NFR-11, AC-23 and A22 are Pass only on the orchestrator's A22 evidence; I did not run the browser check myself. Several rows stay non-Pass because W4-A was intentionally not created. Phase B is N/A.

**Gates (my own runs)**
- `./scripts/check.sh all` passes: server 798 tests, client 689, core 69, plus typecheck, lint and arch.
- `eval-contract-parity` 5/5. `pnpm verify:l06` 114/114.
- `pnpm exec vitest run .it.test` has 7 failures, all outside SPEC-10:
  - Known baseline: skills-stats x4 and the skills 404 test.
  - onboarding-tour x2 (NFR-6 and 'schema-invalid output is discarded'): flake, because `test/onboarding-tour.it.test.ts` run alone passes 28/28.
  - All eval ITs pass.
- NFR-16 greps are empty. No migration, lockfile, package.json or vendor-ui change.

**Non-Pass rows**

| Status | Rows |
|---|---|
| Unverified (carried) | A19, A20, NFR-1, NFR-8, NFR-13, EC-29 |
| Pass (code) / runtime Unverified (carried) | A5, AC-2, AC-3, AC-7, EC-3, EC-4, EC-9 |
| Pass (UI) / route Unverified (carried) | EC-1, EC-2 |
| Pass (code) / contrast and focus Unverified (carried) | NFR-10 |
| Pass by orchestrator A22 evidence | A22, AC-24 (was Unverified), EC-11 (was Pass (code) / render Unverified), NFR-11 (was Unverified), AC-23 (was Pass (code) / render Unverified) |

- **AC-25 (carried, was Fail in verify #1):** now Pass. A new gap is that no automated test covers the PATCH title behaviour; it rests on code plus the ad hoc trace in 1b.
- **A22:** the row must be recorded in the PR description. The first viewport was 1500×950; the post-fix viewports were 1280×720, 768×600 and 700×600.

**Fix-round evidence that changed (all Pass)**
- ExpectedOutputPane `type="button"`: ExpectedOutputPane.tsx:59 and the B1 test.
- `freezeCaseInput(input, finding?)` / `insertFindingCase`: service.ts:215-294. The same location keeps the finding's `kind`; an edited location gets the strict hunk check. The code reads correctly, but no server test exercises this path.
- FindingsPanel shortcut guard: S1 test.
- EvalCaseButton single stable root plus portal: B3 and portal tests.
- EditorModal `takenOwners` kept across owner changes: EC-5 and B4 tests.
- `updateCase` title persistence (AC-25): service.ts:447 and :462.

**Lacking an automated test because W4-A was not created**
- **Server runtime** (no eval-draft IT, no `draft.test.ts`, `verify:l06` list unchanged):
  - AC-2, AC-3, AC-7 (persisted `source_finding_id`, `input_meta`, finding kind).
  - AC-25 PATCH title.
  - EC-1 and EC-2 (route side), EC-3, EC-4, EC-9 (route side), EC-29.
  - NFR-1, NFR-4, NFR-8, NFR-13.
  - UI-6 (`buildDraftName` truncation).
- **Client:**
  - No own tests for eval-kpi-cards or eval-case-row; AC-27..AC-32 are covered only through the modified EvalsTab tests.
  - `useEvalCaseDraft` has no unit test.
- **No check of any kind:** NFR-10 contrast and focus, and NFR-13 timing.

**Spec status:** I recommend the spec Status stay `draft`. Phase B (B1-B20) has not started, and the Unverified rows above remain.