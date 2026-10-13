## Hand-back 1

## Implementation report: SPEC-05 Slice 2, steps 6-8 (client)

Steps 6-8 are done, and `client` typecheck, lint, arch and test all pass. Nothing is committed, and I did not touch `server/` or `e2e/`.

### Files changed (under `/Users/harlock/Downloads/Sites/devdigest/client`)
- **Nav and active key (step 6):**
  - `src/vendor/ui/nav.ts`: the only vendor edit. It adds one `onboarding-tour` entry (icon `Boxes`) between Pull Requests and Project Context.
  - `src/components/app-shell/helpers.ts`: a precise `/repos/:id/onboarding-tour` match, and `/onboarding` (Add repository) now maps to `""`.
  - `src/components/app-shell/helpers.test.ts`: three new cases.
  - `messages/en/shell.json` needed no change because `nav.onboarding-tour` already exists.
- **Hook:**
  - `src/lib/hooks/onboarding-tour.ts` holds `useOnboardingTour`: the GET query, the generate mutation, polling, the 200 s give-up, poll-failure handling, and a 409 that follows the running generation.
  - It is exported from `src/lib/hooks/index.ts`.
  - `src/lib/hooks/onboarding-tour.test.tsx` tests it.
- **Messages:** `messages/en/onboarding.json` has a new `tour.*` block, and all existing keys are kept.
- **Route (step 7), under `src/app/repos/[repoId]/onboarding-tour/`:**
  - `page.tsx` (thin) and `constants.ts` (section ids and order).
  - `_components/` holds `TourPage`, `TourHeader`, `TourSection`, `ArchitectureSection`, `CriticalPathsSection`, `RunLocallySection`, `ReadingPathSection`, `FirstTasksSection` and `OnThisPage`.
  - Each folder has `index.ts` and `styles.ts`, plus `helpers.ts` or `constants.ts` where needed.
- **Tests (step 8):**
  - `OnThisPage.test.tsx`: aria-current, click expands, focuses and sets the hash, reduced motion, spy without a hash before scroll, click-lock until `scrollend`, hash on load.
  - `TourSection.test.tsx`: collapse and `aria-expanded`.
  - `RunLocallySection.test.tsx`: copy success and denied.
  - `CriticalPathsSection.test.tsx`: Open link `href`, `target` and `rel`.
  - `TourHeader.test.tsx`: Stale, "No index yet", skeleton badge and disabled button while generating.
  - `ArchitectureSection/helpers.test.ts`: mermaid source builder.

### Gates
- `./scripts/check.sh client typecheck` — PASS client:typecheck
- `./scripts/check.sh client lint` — PASS client:lint
- `./scripts/check.sh client arch` — PASS client:arch
- `./scripts/check.sh client test` — PASS client:test (338 passed)

### Answers to the e2e cross-check
1. Yes. The headings are "Architecture overview", "Critical paths", "How to run locally", "Guided reading path" and "First tasks".
2. Yes, with one condition. The badge reads "Skeleton — {degraded_reason}", or just "Skeleton" when there is no reason. It says "Skeleton" whenever `meta.source` isn't `llm`.
3. Yes. "On this page" is a visible label and also the nav's `aria-label`.
4. Yes. The TOC items are `<a href="#architecture">`, `#critical-paths`, `#run-locally`, `#reading-path` and `#first-tasks`. The nav comes before the sections in the DOM. The sidebar and top bar use real-path links, and model prose links come later.
5. Yes. A click calls `replaceState` with `#id`, so `#…` is in `location.href`.
6. Yes. The observer only calls `replaceState` after a real `scroll` event, and not while the click-lock or hash-load lock is active. A plain load never writes a hash. Only the native `scroll` event sets the "user scrolled" flag.

### Deviations and notes
- **Hook filename:** the plan said `useOnboardingTour.ts`. I used `onboarding-tour.ts` because the root naming rule is kebab-case for non-component TS and the sibling hook files are kebab-case. The exported hook is still `useOnboardingTour`.
- **Complexity label (AC-9):** I could not render it. `TourFirstTask` has only `title`, `description` and `paths`. Each card shows a "Suggestion" badge instead. Adding a `complexity` field would need a contract change, so please decide.
- **"Open" link (AC-31):** it uses `githubBlobUrl(full_name, index_sha || default_branch, path)`.
- **"No index yet" (EC-11):** the tour response has no `lastIndexedSha`, so the page also calls the existing `useRepoIntelStatus`. "No index yet" shows only when that value is `""`, and it wins over Stale. While the value is unknown, nothing extra shows.
- **Architecture prose:** it uses the ui `Markdown` component, not `SafeMarkdown`. `Markdown` renders raw HTML as literal text (EC-23), whereas `SafeMarkdown` drops it.
- **Polling end:** it stops when a read taken after the POST reports `generating:false`. It does not compare `generated_at`, which also covers the slice-2 stub.
- **Retry:** Retry on timeout or poll failure re-POSTs generate, and a 409 just resumes polling.
- **Seams left clean:** `TourHeader` has no model hint, no failure notices and no ranking toggle, but `statusBadgeKey` already handles `llm` ("Written by"). The "Active recently" label is not built.
- **Mistake, fixed:** one batch of files was first written to the repo root by mistake because a `cd` failed. I moved them into place, and `git status` shows no strays.

### Handoff note
- **Review:** `OnThisPage` uses `flushSync` inside a click handler and an effect, so have the architecture review look at that.
- **Nav icon:** it is `Boxes`, reused from the existing kit, so check it is acceptable.
- **Lockfiles:** nothing was run that touches them.

---

## Hand-back 2

## Slice 3 step 13 (client): done

The Generate/Regenerate, model hint, "Written by", EC-7 link and EC-3 notice are all wired. Gates on `client` all pass. Nothing is committed, and I did not touch `server/` or the contracts. The `nav[aria-label="On this page"]` label is unchanged.

### Gates
- `./scripts/check.sh client typecheck` — PASS client:typecheck
- `./scripts/check.sh client lint` — PASS client:lint
- `./scripts/check.sh client arch` — PASS client:arch
- `./scripts/check.sh client test` — PASS client:test (346 passed)

### Files (under `/Users/harlock/Downloads/Sites/devdigest/client`)
- **`src/lib/hooks/onboarding-tour.ts`:** polling now stops when `meta.generated_at` differs from its value when the POST was accepted. It also stops when a read taken after the POST reports `generating:false`, which covers failures because they keep the old `generated_at`. This reconciles with the earlier logic as an OR.
- **`src/app/repos/[repoId]/onboarding-tour/constants.ts`:**
  - `REASON_MODEL_NOT_CONFIGURED = "Model not configured"`.
  - `SETTINGS_MODELS_HREF = "/settings/models"`, which is the existing Feature Models route.
- **`_components/TourHeader/`:**
  - `helpers.ts` has `isModelNotConfigured`, `hasFailedRegeneration` and `modelHintLabel`.
  - `TourHeader.tsx` and `styles.ts` render the button label, hint, badge, link and notice. The button reads Generate when nothing is stored, Regenerate when stored, and "Generating…" disabled while polling.
  - The hint is visible text "Uses {provider} / {model}" below the button, tied to it with `aria-describedby`, so it is keyboard and screen-reader accessible.
  - The badge reads "Written by <model>" for `source === "llm"`.
  - For EC-7, the "Skeleton — Model not configured" badge stays first, and a Settings → Feature Models link is added next to it.
  - The EC-3 notice is a warning badge shown only for a stored llm tour with `last_error` set.
- **`messages/en/onboarding.json`:** new keys `configureModel`, `regenFailed`, `modelHint`.
- **Tests:**
  - `TourHeader.test.tsx`: llm badge, hint and Regenerate label; EC-7 link; EC-3 shown and not shown.
  - `onboarding-tour.test.tsx`: unchanged in behaviour. I tried a `generated_at` test but dropped it because it could not show the stop reliably.

### Assumptions about server meta fields (the contract has no structured flags)
- **EC-7:** the client matches `meta.degraded_reason === "Model not configured"` exactly. `server/src/modules/onboarding-tour/constants.ts` has no such reason yet, so slice 3 server must emit exactly that string, or add a structured field later.
- **Other reasons:** the client shows any other `degraded_reason` verbatim, for example "Repository is not cloned" or "No index yet".
- **EC-3:** this keys off `meta.source === "llm"` together with a non-empty `meta.last_error`, not off the error text. The server currently writes the generic "Tour generation failed", and the client does not display that string.
- **EC-3 time:** there is no failure timestamp in the meta. The server preserves the previous `generated_at` on failure. The notice therefore reads "Last regeneration failed · showing the tour from {relative generated_at}" and does not claim a failure time. A true failure time would need a contract field (for example `last_error_at`).
- **Model hint:** the server currently returns `model_hint` with empty strings when nothing is resolvable. The client hides the hint when `model` is empty.

### Deviations
- None from the plan. The EC-3 wording above is a deliberate adaptation to the missing timestamp.

---

## Hand-back 3

The EC-3 notice now reads "Last regeneration failed · <relative last_error_at>". It still only shows for `meta.source === "llm"` with a non-empty `last_error`. I did not commit anything.

**Gates**
- `./scripts/check.sh client typecheck` — PASS client:typecheck
- `./scripts/check.sh client lint` — PASS client:lint
- `./scripts/check.sh client arch` — PASS client:arch
- `./scripts/check.sh client test` — PASS client:test (346 passed)

**Fallbacks when `last_error_at` is missing**
- If `last_error_at` is absent, it shows "Last regeneration failed · showing the tour from <relative generated_at>".
- If `generated_at` is also absent, it shows just "Last regeneration failed".

**Files (under `/Users/harlock/Downloads/Sites/devdigest/client`)**
- `src/app/repos/[repoId]/onboarding-tour/_components/TourHeader/TourHeader.tsx`
- `src/app/repos/[repoId]/onboarding-tour/_components/TourHeader/TourHeader.test.tsx`: the EC-3 test now covers both the fallback wording and the `last_error_at` wording.
- `messages/en/onboarding.json`: `regenFailed` now uses `last_error_at`, plus new keys `regenFailedOlder` and `regenFailedNoTime`.

The hook is unchanged, and the client copy of `knowledge.ts` already has `last_error_at`.

---

## Hand-back 4

## Slice 4, steps 15 and 16 (client): done

The ranking toggle, days input, warning, EC-8 disabled state, header label, EC-9 line and "Active recently" labels are all in. All four client gates pass. I did not commit anything or touch `server/` or the contracts.

### Gates
- `./scripts/check.sh client typecheck` — PASS client:typecheck
- `./scripts/check.sh client lint` — PASS client:lint
- `./scripts/check.sh client arch` — PASS client:arch
- `./scripts/check.sh client test` — PASS client:test (356 passed)

### Files (under `/Users/harlock/Downloads/Sites/devdigest/client`)
- **New `_components/RankingToggle/`** (under `src/app/repos/[repoId]/onboarding-tour/`):
  - A `fieldset` radio group with the legend "Ranking" and two options: "Import graph only" (default) and "Include recent activity (hotness)".
  - Choosing activity reveals a labelled number input prefilled 180, with an `aria-invalid` error for values outside 7–730 or non-integers, and a `role="note"` disk-growth warning.
  - With no clone the activity radio is disabled, and the reason "No local clone — activity ranking unavailable" is linked to it by `aria-describedby`.
  - The folder also has `constants.ts`, `helpers.ts` (`parseWindowDays`), `styles.ts`, `index.ts` and `RankingToggle.test.tsx`.
- **`TourHeader/`:**
  - It now owns the mode and days state. Generate calls `onGenerate({mode:"import_graph"})` or `{mode:"activity", window_days}`, and is disabled while the days value is invalid.
  - The ranking label was already there (AC-18).
  - A `role="status"` line shows "Activity ranking unavailable — ranked by import graph" when `meta.ranking_fallback` is set, with the server's reason in its `title`.
  - `TourHeader.test.tsx` has new cases for the label, the fallback line, the POST body and the disabled button.
- **`TourPage/TourPage.tsx`:**
  - It passes the request through to `tour.generate(req)`.
  - It passes `activityRanked` (meta `ranking_mode === "activity"`) to `CriticalPathsSection` and `ReadingPathSection`.
  - It passes a hotness lookup built from the critical paths to `ReadingPathSection`.
- **`CriticalPathsSection/` and `ReadingPathSection/`:**
  - Each shows the text label "Active recently" (not colour-only) when the tour was activity-ranked and normalised hotness is at least 0.5.
  - The threshold and `hotnessByPath` live in `ReadingPathSection/helpers.ts`.
  - Tests are added in both folders.
- **`messages/en/onboarding.json`:** new `tour.ranking.*` keys and `tour.activeRecently`.
- The hook is unchanged: it already forwards the request to the POST.

### Deviations and notes
- **Reading-path hotness:** `hotness` exists only on `TourCriticalPath`, not on `TourReadingStep`, and I did not change the contract. Reading-path items get "Active recently" only when the same path also appears in the critical paths with hotness of 0.5 or more. Reading-path files that are not critical paths are never labelled, so AC-27 is only partly met for that section. To label every file, the server would need to add `hotness` to `TourReadingStep`. Please decide.
- **EC-9 line:** it shows the fixed spec text whenever `meta.ranking_fallback` is non-empty. The server's raw reason is only in the `title` attribute.
- **Activity selection without a clone:** the selection is not sent. If `can_use_activity` flips to false, the request falls back to `import_graph`.
- **Mode reset:** the chosen mode and days are local state in `TourHeader` and reset on reload.

---

## Hand-back 5

`ReadingPathSection` now reads `item.hotness` directly for "Active recently" (at least 0.5). It only shows when `meta.ranking_mode === "activity"`. The `hotnessByPath` lookup and its TourPage plumbing are gone. All four client gates pass, and nothing is committed.

**Gates**
- `./scripts/check.sh client typecheck` — PASS client:typecheck
- `./scripts/check.sh client lint` — PASS client:lint
- `./scripts/check.sh client arch` — PASS client:arch
- `./scripts/check.sh client test` — PASS client:test (357 passed)

**Files** (under `/Users/harlock/Downloads/Sites/devdigest/client/src/app/repos/[repoId]/onboarding-tour/_components/`)
- `ReadingPathSection/ReadingPathSection.tsx`: the `hotness` prop is removed.
- `ReadingPathSection/helpers.ts` and `index.ts`: `hotnessByPath` is removed; `isActiveRecently` and its threshold remain.
- `ReadingPathSection/ReadingPathSection.test.tsx`: items now carry `hotness` of 0.5, 0.49 and null. It expects one label when activity-ranked and none otherwise.
- `TourPage/TourPage.tsx`: the `hotnessByPath` import and the `hotness` prop are removed. It still passes `activityRanked`.

The EC-8 422 needs no client change: the disabled radio already prevents it, and the hook's global error handling covers anything else.

---

## Hand-back 6

All four items are handled and the four client gates pass. Nothing is committed.

**Items**
1. **Fixed (stale copy).** In `client/messages/en/onboarding.json` I removed the legacy keys `sections`, `sectionCount`, `regenerate`, `regenerating`, `unknownError` and `generate.*`, which held the old five-section copy. A grep found no `t("…")` use of them in the `onboarding` namespace. The keys still used are `title` and `loadError.title` (by `TourPage`), plus the whole `tour.*` block. The file had no Add-repository keys to keep. `AddRepoView` has no `useTranslations` call, so nothing there was affected.
2. **Already correct, no change.** `SETTINGS_MODELS_HREF = "/settings/models"` resolves to Feature Models. `SETTINGS_SECTIONS` in `nav.ts` includes `{ key: "models", label: "Feature Models" }`. `SettingsView` looks the section up by `useParams().section`.
3. **Fixed (test added).** New `_components/ArchitectureSection/ArchitectureSection.test.tsx`. Prose containing `<img onerror>`, `<script>` and `<b>` creates no `img`, `script` or `b` element, and the literal text appears in `textContent`. It also has an EC-15 empty-state case.
4. **Already covered.** The test "AC-12: spy marks the heading in the top band; no hash is written before the user scrolls" in `_components/OnThisPage/OnThisPage.test.tsx` covers it. It fires the mocked `IntersectionObserver` and checks `aria-current` and that the hash stays empty. It then dispatches a `scroll` event, fires the next intersection, and checks the new item has `aria-current="true"` and `location.hash === "#c"`.

**Gates**
- `./scripts/check.sh client typecheck` — PASS client:typecheck
- `./scripts/check.sh client lint` — PASS client:lint
- `./scripts/check.sh client arch` — PASS client:arch
- `./scripts/check.sh client test` — PASS client:test (359 passed)