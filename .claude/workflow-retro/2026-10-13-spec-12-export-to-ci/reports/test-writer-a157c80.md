## Hand-back 1

## Test-writing report: SPEC-12 client tests

All client-observable SPEC-12 ACs, ECs, NFRs and UI items are now covered, except NFR-14. I found no bugs, and I edited only test files. All four gates pass.

### Gate results
- `./scripts/check.sh client related <each file>`: PASS for ExportWizard, CiRunsView, CiTab, hooks `ci`, AgentEditor and the new page test.
- `./scripts/check.sh client test`: **PASS, 907 passed, 0 failed**. The baseline was 790 before the feature.
- `./scripts/check.sh client typecheck`: PASS.
- `./scripts/check.sh client lint <all touched test files>`: PASS.

### Tests added
All paths are under `client/src`. In the "Test" column, `[CiTab]`, `[CiRunsView]` and `[Wizard]` are short for the long paths below.

**New file**
- `app/agents/[id]/page.test.tsx` has 2 tests for AC-36.
  - `?tab=ci` opens the CI tab.
  - An unknown tab falls back to `config`, and switching writes `?tab=ci`.

**Extended**
- `app/agents/[id]/_components/ExportWizard/ExportWizard.test.tsx` (new describe "added SPEC-12 coverage", 8 tests):
  - AC-2: the four steps are listed in order.
  - AC-3: the target card sits above the repository selector.
  - AC-44: no initial repo means the active repo is selected and unlocked.
  - AC-33: `ci_repo_taken` names the other agent and stays on Install.
  - EC-8: `ci_export_running` tells the user to wait.
  - NFR-13: Tab wraps in both directions and focus returns to the opener on close.
  - NFR-13: `aria-pressed` follows clicks and the status region announces the step.
  - NFR-15: no "Publish to CI" or "Requires a GitHub App" text or keys.
- `app/ci-runs/_components/CiRunsView/CiRunsView.test.tsx` (11 tests; 10 listed here plus the second EC-31 test in the "Refresh" row of the table):
  - AC-46: nine columns in order, server order kept, request carries `limit=200`.
  - AC-47: all three verdicts show as text, and a running run shows "Running" with no time.
  - AC-48: severity counts as hover text and as screen-reader text.
  - AC-50: filter by repository and status, plus the "No CI runs match these filters" state.
  - AC-51: subtitle text.
  - AC-52: Refresh posts `{force:true}` with no installation id.
  - AC-53: a fresh installation is not refreshed on open.
  - AC-63: opening the page makes only GET calls.
  - EC-32: truncation with ellipsis, full text in `title` and in the DOM.
  - EC-31: a refresh that fails outright keeps the rows and shows Retry.
- `app/agents/[id]/_components/AgentEditor/_components/CiTab/CiTab.test.tsx` (7 tests, new describe "CiTab — added SPEC-12 coverage"):
  - AC-37: "Active in 0 repos" and the plural form.
  - AC-39: relative time shown on a row that has a run.
  - EC-33: "Manual" status and an em dash for the time.
  - AC-53: `useAutoRefreshCi` is called with the agent's installations (the mock now records its arguments).
  - AC-40: selecting a row again hides the history.
  - AC-42: the pending segment shows as pressed and the control is disabled.
  - NFR-15: no old strings, and strings come from `ci.json`.
- `app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` (1 test): AC-36, `tab="ci"` renders the CI tab and clicking CI calls `onTab("ci")`. `CiTab` is mocked there.
- `lib/hooks/ci.test.tsx` (5 tests):
  - AC-52: forced refresh body plus an `AbortSignal` (60 s timeout).
  - EC-31: a timeout surfaces as an `ApiError` carrying `details.name`.
  - AC-63: the lists only use GET.
  - AC-53: auto-refresh runs each stale installation once, unforced, and skips fresh ones.
  - EC-31: auto-refresh stops at the first failure and reports `isError`.

**ID prefixes on existing tests.** I renamed 54 existing tests, prefix only (the Wizard rows in the table cite them by their prefixed names). The files were `ExportWizard.test.tsx`, `ci.test.tsx`, `CiRunsView.test.tsx`, `CiRunsView/helpers.test.ts`, `CiRunsTable/helpers.test.ts` and `CiTab.test.tsx`. The two `AC-8` Install-radio IDs were already prefixed.

### AC/EC → test map
`[Wizard]` is `app/agents/[id]/_components/ExportWizard/ExportWizard.test.tsx`. `[CiTab]` is `app/agents/[id]/_components/AgentEditor/_components/CiTab/CiTab.test.tsx`. `[CiRunsView]` is `app/ci-runs/_components/CiRunsView/CiRunsView.test.tsx`.

| ID | Test |
|---|---|
| AC-1 | [Wizard] `AC-1: opens on Target with the active repository…`; [CiTab] `AC-38: shows 'Not deployed to CI yet'…` (Add to CI opens the wizard) |
| AC-2 | [Wizard] `AC-2: ticks completed steps…`, `AC-2: the four steps are listed in the order…` |
| AC-3 | [Wizard] `AC-3: shows GitHub Actions as the only, recommended target`, `AC-3: the target card sits above…` |
| AC-4, AC-5, AC-6 | [Wizard] `AC-4: lists every file…`, `AC-5: shows any other file read-only`, `AC-6: loads a runner file only when…` |
| AC-7, AC-8, AC-9 | [Wizard] `AC-7/AC-8: defaults to opened…`, `AC-9: explains how to block merges…` |
| AC-10, AC-11 | [Wizard] `AC-10: offers PR (default…`, `AC-11: reminds about OPENROUTER_API_KEY…` |
| AC-12, AC-13, AC-15, AC-16, AC-17, AC-19 | Server behaviour (commit, PR, stored installation, branch reuse, no default-branch write); not client |
| AC-12/13 request side | [Wizard] `AC-20: sends the PR request without workflow_yaml…` (the client sends `action: "open_pr"`) |
| AC-14 | [Wizard] `AC-14: shows View pull request…`, `AC-14: renders no link for a pr_url…` |
| AC-18 | [Wizard] `AC-18: downloads the zip…`; `lib/hooks/ci.test.tsx` `AC-18: useDownloadCiArchive…` |
| AC-20 | [Wizard] two `AC-20:` tests (workflow text only when edited) |
| AC-21..AC-31 | Server-generated files; not client |
| AC-32 | [Wizard] `AC-32: disables Continue and names the agent…` |
| AC-33 | [Wizard] `AC-33: ci_repo_taken from the server names…` (the 409 itself is server-side) |
| AC-34 | [Wizard] `AC-34: lets the same agent continue…` |
| AC-35 | [Wizard] `AC-35: locks the repository and prefills…`; [CiTab] `AC-35:` ×2 |
| AC-36 | `AgentEditor.test.tsx` `AC-36:` ×2; `page.test.tsx` `AC-36:` ×2 |
| AC-37 | [CiTab] `AC-37: counts only active installations…`, `AC-37: the badge reads 'Active in 0 repos'…` |
| AC-38 | [CiTab] `AC-38: shows 'Not deployed to CI yet'…` |
| AC-39 | [CiTab] `AC-39/EC-33: a row shows repo, target…`, `AC-39: a row with a run shows…` |
| AC-40 | [CiTab] `AC-40: nothing is fetched until a row is selected…`, `AC-40: selecting the same row again…` ("newest first" is the server's order) |
| AC-41, AC-42 | [CiTab] `AC-41/AC-42: marks the agent's value…`, `AC-42: the segment being saved…` |
| AC-43 | [CiTab] `AC-43: marks a row whose update is available` (the flag is server-derived) |
| AC-44 | [CiTab] `AC-44: + Add repository…`; [Wizard] `AC-44: without an initial repository…` |
| AC-45 | `CiRunsView/helpers.test.ts` `AC-45: GLOBAL sidebar section…` (`NAV` plus `activeKeyFor("/ci-runs")`) |
| AC-46 | [CiRunsView] `AC-46: shows the nine columns…` and the first list test |
| AC-47 | [CiRunsView] `AC-47: shows all three verdicts…` (the verdict calculation is server-side) |
| AC-48 | [CiRunsView] `AC-48: the findings total carries…` and the first list test |
| AC-49 | [CiRunsView] `AC-46/AC-48/AC-49/…: lists runs…` (`target=_blank`, `rel`, trusted URL) |
| AC-50 | [CiRunsView] `AC-50:` ×3 (agent, repository, status, no-match); `CiRunsView/helpers.test.ts`; `ci.test.tsx` `AC-50:` |
| AC-51 | [CiRunsView] `AC-51: the subtitle states…` |
| AC-52 | [CiRunsView] `AC-52: Refresh posts a forced refresh…`; `ci.test.tsx` `AC-52: useRefreshCi…` |
| AC-53 | [CiRunsView] `AC-53:` ×2; `ci.test.tsx` `AC-53:` ×2; [CiTab] `AC-53: opening the tab starts…` |
| AC-54..AC-62, AC-64, AC-65 | Server; not client |
| AC-63 | [CiRunsView] `AC-63:`; `ci.test.tsx` `AC-63: the installation and run lists only issue GET…` (client side only) |
| EC-1 | [Wizard] `EC-1: github_token_missing points to Settings → API Keys` |
| EC-2 | [Wizard] `EC-2: github_permission names the token permissions` |
| EC-3 | [Wizard] `EC-3: shows runner_bundle_missing…` |
| EC-6 | [Wizard] `EC-6: disables Continue when no trigger is on` (the 422 is server-side) |
| EC-7 | [Wizard] `EC-7: shows warnings and still allows Continue` |
| EC-8 | [Wizard] `EC-8: ci_export_running…` |
| EC-9 | [Wizard] `EC-9: ci_pr_failed offers Retry…` |
| EC-10 | [Wizard] `EC-10: ci_no_changes…` |
| EC-11 | [Wizard] `EC-11: a 422 shows the parser message…` |
| EC-12 | [Wizard] `EC-12:` ×3 (cancel, confirm, no-edit) |
| EC-13 | [Wizard] `EC-13: asks before closing with an edit…` |
| EC-16 | [Wizard] `EC-16: flags an empty memory file` |
| EC-17 | [Wizard] `EC-7: shows warnings…` (the 500-row warning; not separately tagged, so I added no separate EC-17 test) |
| EC-29, EC-37 | [CiRunsView] the first list test; `CiRunsTable/helpers.test.ts` `EC-29/EC-37:` |
| EC-30 | [CiRunsView] `EC-30: shows the empty state…` |
| EC-31 | [CiRunsView] `EC-31:` ×2; [CiTab] `EC-31:`; `ci.test.tsx` `EC-31:` ×2; `CiRunsView/helpers.test.ts` `EC-31:` |
| EC-32 | [CiRunsView] `EC-32: a long repository and agent name…` |
| EC-33 | [CiTab] `AC-39/EC-33:`, `EC-33: a manual installation…` |
| EC-35 | [Wizard] `EC-35: keeps Install disabled…` |
| NFR-13 | [Wizard] `NFR-13:` ×5 (dialog role and name, `aria-live`, Esc, focus trap and restore, `aria-pressed`, `aria-current`). In [CiRunsView], verdict and status carry text, not only colour. |
| NFR-14 | Not testable in jsdom (no layout at 768 px). It needs the browser/e2e flow. |
| NFR-15 | [Wizard] and [CiTab] `NFR-15:` tests |
| UI-11 | [CiRunsView] first list test; [CiTab] `UI-11:`; `CiRunsTable/helpers.test.ts` `UI-11:` |
| UI-12 | [CiRunsView] first list test; [CiTab] `AC-40:` (the PR link is built from repo and number); `CiRunsTable/helpers.test.ts` `UI-12:` |

### Findings (not fixed)
- No bugs found in the client code.
- Observation, not a defect: `useRefreshCi` aborts with `AbortSignal.timeout(60_000)`. jsdom cannot wait 60 s, so the test asserts that the signal is passed and that a `TimeoutError` is handled, not that it aborts at exactly 60 s.

### Out of scope
- Server-side ACs, ECs and NFRs (AC-12/13/15/16/17/19, AC-21..AC-31, AC-33's 409, AC-47's calculation, AC-54..AC-62, AC-64, AC-65, EC-4/5/14/15/17..28/34/36, NFR-1..12, NFR-16, UI-1..10 and UI-13 at the server layer). These belong to the later server run.
- NFR-14 needs a real viewport, so it belongs to the e2e flow.
- `reviewer-core/`, `e2e/`, `agent-runner/`, `server/` and vendor files were not touched.