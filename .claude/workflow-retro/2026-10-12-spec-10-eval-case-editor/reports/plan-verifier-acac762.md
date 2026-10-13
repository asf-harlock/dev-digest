## Hand-back 1

## Plan verification: SPEC-10 Phase A (pass 1 of 2)

Verdict: Phase A has 1 Fail (AC-25, title edits lost on PATCH). No other row Fails. A19 and A20 (new test files), A22 (manual browser check), AC-24, NFR-1, NFR-8, NFR-11, NFR-13, EC-29 and the runtime side of the draft route stay Unverified. Phase B is N/A.

Full matrix: `/Users/harlock/Downloads/Sites/devdigest/.claude/sdd/SPEC-10/verify-1.md`

### Gates re-run (my own runs)
- `./scripts/check.sh all` passes. server typecheck, lint, arch and test (798) pass. client typecheck, lint, arch and test (684) pass. core typecheck and test (69) pass.
- `cd server && pnpm exec vitest run eval-contract-parity` passes, 5/5.
- `cd server && pnpm verify:l06` passes, 114 tests (Docker was up). The file list is still the six original entries.
- The eval ITs `eval-cases`, `eval-cases-race`, `skill-eval`, `skill-eval-runs` and `eval-trend` pass, 72 tests. This covers NFR-15.
- The NFR-16 grep over `client/src` and the `skillEval` grep in `prReview.json` both return nothing.
- Vendor: only the two `contracts/knowledge.ts` files changed. The +/- lines of the two diffs are identical, every hunk sits inside `// ---- Eval ----` to `// ---- Memory ----`, and no `.default()` was added.
- No migration, lockfile, `package.json` or `vendor/ui` edits appear in `git status`.

### Non-Pass rows

| Item | Status | Evidence |
|---|---|---|
| AC-25 (and AC-20 for the `title` key) | **Fail** | See F1 below. |
| A19 `draft.test.ts`, `eval-draft.it.test.ts`, `verify:l06` edit | Unverified | Not created, as intended. |
| A20 new client tests | Unverified | Not created, as intended. The edited `CaseEditor`, `EvalCaseButton`, `EvalsTab` and `helpers` tests already cover the parser, banner, picker, layout styles and EC-5, and they pass. |
| A22 manual browser check | Unverified | Orchestrator. |
| AC-24, NFR-11 | Unverified | The styles set `min-height: 0` and `overflow: hidden`, and a layout-style assertion exists in the edited `CaseEditor` test. The actual absence of scrollbars needs the browser. |
| AC-23, EC-11 (rendering) | Unverified | Code is correct; rendering needs the browser. |
| AC-2, AC-3, AC-7, EC-1 to EC-4, EC-9 (server runtime), EC-29 (draft), NFR-1, NFR-13, NFR-8 | Unverified | The code is correct and no LLM call is in the draft path, but only the missing `eval-draft.it.test.ts` could prove it. |
| NFR-10 contrast and focus | Unverified | Needs the browser. |

### Findings

**F1 (Fail, AC-25, low to medium).** A title edited in **Expected output** on a stored manual case is silently dropped.
- `updateCase` in `server/src/modules/eval/service.ts` (about lines 435 and 447) calls `effectiveExpectation(update.expectation, stored.title)`. The stored title always wins, and `classifyEdit` ignores title.
- The client's dirty check includes the title, so a title-only edit sends `PATCH {expectation}`.
- The server returns 200 with no change, the modal closes, and a reload shows the old title.
- AC-25 routes the parsed object through SPEC-09 AC-14 and AC-15, which are the PATCH routes.
- Implementer decision (2) makes create persist the title but PATCH does not, so this behaviour is a direct consequence of it.

**D1 (plan deviation, `client/src/lib/api.ts`).** The change is additive: a private `request`, `apiFetchWithStatus` and `api.postWithStatus`. `apiFetch` behaviour is unchanged.
- My view: it does not contradict the plan or spec constraints. `lib/api.ts` is the one place `fetch` is allowed (`client/CLAUDE.md:39`), and no vendor, lockfile or migration file was touched.
- It is also required. A11 and EC-5 ("skill route 200 = already exists") cannot be implemented without the HTTP status.
- I recommend accepting it as a recorded deviation.

### Implementer decisions against the spec
1. Draft name cut to 80 characters total: accepted. It matches AC-4, Q-8 and the 80-character `EvalCaseInput` name limit. Plan A4 and UI-6 say "after the prefix", which is ambiguous.
2. Title persisted for manual cases: accepted for create, but it causes F1 on edit.
3. `{}` body returns 422: accepted. `{}` is a body, so AC-8's "no body" does not apply.
4. Negative banner without the title: accepted. AC-16 only requires the same location.
5. Row dropped `file:lines`: accepted. AC-29 does not list it.
6. Skill-tab pill falls back to `0/0 passing`: accepted. The skill pill comes from the overview's latest set run, while the agent pill comes from the case list. The skill tab also has no dashboard link, which AC-31 does not require.
7. j/k/a/d shortcuts ignore keys inside `[role=dialog]`: accepted. It is outside the plan text but inside an owned file and harmless.
8. i18n floors raised to more than 90 files and more than 160 uses: accepted. This follows A17, and the implementer's own count was 97 files and 173 uses.

### Other notes
- A12 said "pure move", but the `EvalKpiCards` props changed from `EvalRunRecord` to `EvalMetrics` so the skill tab can feed the with-skill arm. This is needed for AC-31.
- The indicator and the "+ Finding skeleton" button are hidden in the read-only finding-case mode. AC-13 takes precedence over AC-19 there.
- The owner picker sits in the kit Modal `subtitle` slot. With many skills the header grows and could squeeze the fixed-height body at 1280x720, so check it in A22.