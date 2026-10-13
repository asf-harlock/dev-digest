## Hand-back 1

## Implementation report: SPEC-11 step 13 (W4b, CI tab on the agent page)

Workstream size: 1 step, 5 new component folders (CiTab, StatusPill, InstallationRow, RunHistory, FailOnControl). It is within the 6-step limit but over the 4-folder limit.

### Files changed
Skills applied, resolved from routing.json to the `frontend` bucket: frontend-ui-architecture, next-best-practices, react-best-practices, security, typescript-expert, plus react-testing-library for the tests.
- `client/src/app/agents/[id]/page.tsx`: `"ci"` added to `VALID_TABS`.
- `client/src/app/agents/[id]/_components/AgentEditor/constants.ts`: `ci` tab after `evals`, icon `Workflow`. Both tab-key places are done (INSIGHTS 2026-09-29).
- `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx`: `ci` branch renders `<CiTab key={agent.id} agent={agent} />`.
- `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx`: new AC-36 test (CI after Evals).
- New folders under `client/src/app/agents/[id]/_components/AgentEditor/_components/CiTab/`:
  - `CiTab/`: `CiTab.tsx`, `CiTab.test.tsx` (15 tests), `constants.ts`, `helpers.ts`, `styles.ts`, `index.ts`.
  - `_components/StatusPill/`: icon + text pill for run or installation status (NFR-13).
  - `_components/InstallationRow/`: repo, target, `Workflow vN`, "Update available", status pill, relative time or `—`. It is a `button type="button"` with `aria-pressed`.
  - `_components/RunHistory/`: table of `useCiRuns({installation_id, limit: 50})` with loading, error and empty states. `helpers.ts` + `helpers.test.ts` hold `formatCost` and `isTrustedJobUrl`.
  - `_components/FailOnControl/`: 4-segment control, `role=group`, `aria-pressed`, every button `type="button"`.
- `client/messages/en/ci.json`: `ciTab` block only, plus the stale removals below.
- `client/messages/en/agents.json`: not modified. `editor.tabs.ci` ("CI") already existed.

### Behaviour per spec
- AC-37: the heading is "CI deployment" and the badge is a plural "Active in N repos", where N counts `status==='active'`. The badge is also shown for N=0.
- AC-38: the empty state is "Not deployed to CI yet" with **Add to CI**. "Update CI config" is hidden when there are no installations.
- AC-39 / EC-33: rows are as described above. A `pending_pr` or `manual` row with no run shows "Pending PR" / "Manual" and `—`.
- AC-40: selecting a row shows the latest 50 runs. Clicking the row again deselects it. There is no auto-select.
- AC-41 / AC-42:
  - The control has Never / Critical / Warning + / Any and reuses `useUpdateAgent` with `patch: {ci_fail_on}`.
  - The clicked segment shows as pressed while the save is pending.
  - On success it toasts and calls `refetch()` on the installations query, because the agent version moves and `update_available` changes. `useUpdateAgent` itself is untouched.
- AC-35: **Update CI config** acts on the selected row, else the first. It passes `initial {repo, lockedRepo:true, triggers, post_as}`.
- AC-44: **+ Add repository** (dashed button) passes `initial {repo:"", lockedRepo:false}`. W4a's wizard treats `""` as "no preselect".
- AC-1: **Add to CI** passes no `initial`, so the wizard preselects the active repo.
- AC-53: `useAutoRefreshCi(installations)` runs on tab open.
- EC-31: when its `isError` is set, the tab shows a stale notice with Retry, which calls `useRefreshCi().mutate({force:true})`.
- The wizard is mounted as `<ExportWizard key={session} agent open onClose initial />`, imported from `../../../ExportWizard`. The `key` remounts it for a clean state on each opening. This is W4a's real component with its real props type.

### i18n keys
- Added (all in `ci.json`) under `ciTab`:
  - **Top level:** `heading`, `activeBadge`, `addToCi`, `updateConfig`, `updateConfigHint`, `addRepository`, `emptyTitle`, `emptyBody`, `loadErrorTitle`, `loadErrorBody`, `retry`, `staleNotice`, `installationsLabel`, `workflowVersion`, `updateAvailable`, `noTime`.
  - **Nested groups:** `targets.{gha,circle,jenkins,cli}`, `status.{succeeded,failed,noFindings,running,pendingPr,manual,active}`, `failOn.{label,hint,saved,options.{never,critical,warning,any}}`, `history.{title,selectHint,empty,errorTitle,columns.*,findingsTitle,viewJob,failureReason.{artifactRejected,noArtifact,artifactExpired,cancelled,timedOut,stale}}`.
- Removed:
  - Old `ciTab` keys: `subtitle`, `exportToCi`, `publish`, `update`, `noRepo`, `empty`, `installed`. The old `heading` was reworded.
  - The whole `publishDialog` block.
  - `exportWizard.blockMergeDesc` ("Requires a GitHub App…").
  - A grep over `client/src`, `client/messages` and `e2e/specs` showed no code references to `publishDialog`, `blockMergeDesc`, `blockMergeTitle`, `ciTab` or "Publish to CI".
- Left alone: `exportWizard.blockMergeTitle` is in W4a's block, and I did not touch the rest of that block.
- Verification command: a Python script ran each `t("…")` key from the CiTab files (31 static keys) and every dynamic key expansion (21) against `messages/en/ci.json`. Result: `missing: []`. `JSON.parse` of `ci.json` and `agents.json` is OK. All edits were small targeted Edits, with the file re-read just before each.

### Gate results (inner loop only; the caller runs the outer loop)
- `./scripts/check.sh client typecheck`: PASS. An earlier FAIL was only because W4a's `ExportWizard.tsx` and W3's files were not on disk yet.
- `./scripts/check.sh client related …`: PASS for the CiTab, `helpers.test.ts` and `AgentEditor.test.tsx` tests. `pnpm exec vitest run` on the whole `AgentEditor` folder: 7 files, 51 tests passed (CiTab 15, AgentEditor 3).
- `./scripts/check.sh client lint client/src/app/agents/[id]/_components/AgentEditor client/src/app/agents/[id]/page.tsx`: PASS.
- `./scripts/check.sh client arch`: PASS.

### UI things the gates cannot see
- **Form buttons:** the CiTab is not inside a `<form>`. All Buttons, segments and rows are still `type="button"`, and a test checks the segments.
- **Modal in a container, modal width:** n/a, the tab only mounts W4a's `ExportWizard`, which owns its portal and width.
- **Not checked:** the manual browser check (the orchestrator's step 16).

### Deviations from plan
- **Wizard import path:** the plan said `../ExportWizard`. The correct path from the CiTab folder is `../../../ExportWizard`.
- **`CiTab/` nesting:** it is nested under `AgentEditor/_components/`, next to ConfigTab and EvalsTab.
- **EC-31 stale notice and Retry:** I added it on the tab. The plan listed it only for `/ci-runs`.

### Handoff note
- `formatCost` and `isTrustedJobUrl` are duplicated in `RunHistory/helpers.ts`. W3's `CiRunsView/helpers.ts` has its own copies, and arch forbids importing across routes. If you want them shared, promote them to `src/lib/` in a follow-up.
- `useAutoRefreshCi` plus the `useRefreshCi` Retry may refresh all workspace installations. It calls `mutate({force:true})` with no `installation_id`.
- W4a's `ExportWizard` renders `null` when closed, so the `key={session}` remount only matters while it is open.
- `useUpdateAgent` calls `PUT /agents/:id` (existing hook), while the spec text says PATCH. I used the existing mutation as the spec decided.
- The e2e flow (step 15) can rely on these strings: "Not deployed to CI yet", "Add to CI", "Update CI config", "Add repository", "Fail CI on".