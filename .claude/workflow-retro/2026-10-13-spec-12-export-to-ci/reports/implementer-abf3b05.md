## Hand-back 1

## Implementation report: W4a, Export to CI wizard (plan step 12)

Workstream size: 1 step, but 7 new component folders (ExportWizard plus 6 under `_components/`).

### Files created
Root: `~/emdash/worktrees/devdigest-2b9b9360/l07-lab-export-to-ci/client/src/app/agents/[id]/_components/ExportWizard/`
- `ExportWizard.tsx`, `index.ts`, `constants.ts`, `helpers.ts`, `styles.ts`, `download-blob.ts`, `use-focus-trap.ts`
- `ExportWizard.test.tsx` (40 tests), `helpers.test.ts` (26 tests)
- `_components/{StepIndicator,TargetStep,PreviewStep,ConfigureStep,InstallStep,ErrorNotice,ConfirmBar}/`, each with its component, `styles.ts` and `index.ts`. `StepIndicator` and `PreviewStep` also have `helpers.ts`.
- `client/messages/en/ci.json`: replaced only the `exportWizard` block. It parses as valid JSON and the top-level blocks `runs`, `ciTab` and `page` are intact.

### Public contract (for W4b)
```ts
import { ExportWizard, type ExportWizardProps, type ExportWizardInitial } from "../ExportWizard";
// both a named and a default export
<ExportWizard agent={agent /* Agent from @devdigest/shared */} open={boolean} onClose={() => void}
  initial?={{ repo: string; lockedRepo: boolean; triggers?: ("opened"|"synchronize"|"reopened")[]; post_as?: "github_review"|"pr_comment"|"none" }} />
```
- Add repository: omit `initial`. The wizard preselects the active repo (AC-1).
- Update CI config: pass `initial` with `lockedRepo: true` (AC-35).
- It returns null while `open` is false, and its state resets on every opening.
- It renders through `createPortal` to `document.body`, with `stopPropagation` on clicks, so a mount inside a card does not inherit opacity or overflow.

### Hooks used
Imported from `@/lib/hooks/ci` (W3's file exists, signatures match):
- `useCiInstallations`
- `useCiPreview(agentId, input, enabled)`
- `useCiPreviewFile(agentId, input, path, enabled)`
- `useExportCi`
- `useDownloadCiArchive`

Also `useRepos` from `@/lib/hooks/core` and `useActiveRepo`.

### i18n
- Block added: `exportWizard.*`.
- I removed the unused `circle`, `jenkins` and `cli` target keys. Only GitHub Actions is shown.
- I did not touch `publishDialog`, `ciTab` or `runs`. Removing `publishDialog` stays with W4b.
- Keys check: I ran a python script that resolves every `t("…")` / `t.rich("…")` key in the non-test `.tsx` files against `client/messages/en/ci.json`. Dynamic keys were expanded over their value sets: `warnings.${code}`, `triggers.${trigger}`, `postAs.${option}` and `steps.${key}`. Result: 90 keys checked, 0 missing.

### Gates (inner loop, `./scripts/check.sh`)
- `client related` (ExportWizard.tsx, helpers.ts and both test files): PASS, 66 tests passed.
- `client typecheck`: PASS
- `client lint` on the ExportWizard folder: PASS
- `client arch`: PASS

### UI checks the gates cannot see
- **Form buttons:** every kit `Button` has `type="button"`, and the radios and toggles are native buttons or inputs. A test asserts all buttons are `type="button"`, except the kit modal's own close X (`IconBtn`). The portal keeps that X out of any ancestor `<form>`, and a test asserts it.
- **Modal in a container:** portal to `document.body` plus a `stopPropagation` wrapper, covered by a test.
- **Modal width:** `useFittedModalWidth(880)`. The footer sits in the kit's fixed footer slot, so Continue/Install stay visible at 768 px. I did not check this in a browser.

### Deviations from the brief
1. **Own stepper instead of the vendored `ExportWizardSteps`.** The vendored component cannot set `aria-current="step"` (NFR-13, plan step 12) or spell out "completed", and `vendor/ui` is read-only. I built `_components/StepIndicator` with the same visuals. If you prefer the vendored one, the NFR-13 `aria-current` requirement is not met.
2. **Step folders sit under `ExportWizard/_components/`** (the repo's nested-component convention), not directly under `ExportWizard/`. `ErrorNotice` and `ConfirmBar` are two extra folders. EC-12/EC-13 confirmations are an inline `ConfirmBar` in the footer, not a second modal.
3. **No Fail CI on control anywhere in the wizard.** The Configure info box points to the CI tab (AC-9).
4. **Focus trap, accessible name and Esc.** The kit `Modal` has none of these, so the wizard adds them in `use-focus-trap.ts` plus a window Esc handler. The trap sets `aria-label` and `tabIndex` on the kit's `role="dialog"` element via DOM, and restores focus on close.
5. **Install count text uses `preview.file_count`**, the real file count from the preview.
6. **Extras beyond the plan:** a "Reset to generated" button for an edited workflow, and a `pr_url` link that renders only if it starts with `https://github.com/`.

### Handoff note
- Errors are shown inline, tied to `ApiError.code` and `status`, so the global mutation toast also fires. This is the documented double-toast trap in `client/INSIGHTS.md`. It is deliberate because the dialog needs inline Retry and links. Review may want to decide whether to suppress the toast.
- `install` radio labels: the zip option reads "Download as zip" (spec AC-10), not the design's "Copy files as a zip".
- Not done by me, per instructions: no browser check, and no full-suite `client test`. The orchestrator runs both.
- Remaining for W4b: delete the stale `publishDialog` keys, and mount `ExportWizard` in `CiTab` using the props above.

---

## Hand-back 2

| id | status | evidence |
|---|---|---|
| B1 | fixed | `client/src/app/agents/[id]/_components/ExportWizard/ExportWizard.tsx:77-79`. `repoChoice` now starts from `initial?.repo \|\| null`, so `""` is unset and the active or first repo becomes the real state. I applied the same pattern to the other `initial` fields: `triggers` falls back to the defaults when `initial.triggers` is empty (`:78`), and `post_as` uses `\|\|` (`:79`). |
| B3 | fixed | `ExportWizard.tsx:208`. Back is disabled on Configure while no trigger is selected, which was the smallest change. PreviewStep can no longer be reached with its query disabled, so `ErrorNotice error={null}` never renders. |

Tests are in `ExportWizard.test.tsx`, after the existing "AC-44" test:
- **AC-44 strengthened:** with `initial={repo:"", lockedRepo:false}` it now asserts Continue is enabled, and that going to Preview calls `useCiPreview` for `acme/payments-api` with `enabled` true.
- **New one-repo case:** one connected repo and no active repo, so no change event can fire. Continue is enabled and Preview is requested for `acme/web`.
- **New defaults case:** an Update with `initial.triggers: []` starts on the default triggers.
- **New B3 case:** untoggling every trigger on Configure disables Back. Re-enabling one trigger and going Back shows no alert.
- I did not run the new tests against the old code to confirm they fail there. By reading, the one-repo case would fail without the B1 fix, because `repo` stays `""` and Continue is disabled.

Gates:
- `client typecheck`: PASS
- `client lint` on `ExportWizard.tsx` and `ExportWizard.test.tsx`: PASS
- `client arch`: PASS
- `client related` on `ExportWizard.tsx` and `ExportWizard.test.tsx`: PASS, 79 tests.
- `client test`: FAIL exit=1, 909 tests passed. The one failure is `AgentEditor/_components/CiTab/_components/RunHistory/helpers.test.ts`, which could not be loaded ("Failed to load url … Does the file exist?"). That file belongs to the parallel CiTab/RunHistory workstream and looks like it was mid-edit or moved. I did not touch it. Full log: `.claude/implementer/logs/client-test.log`.