## Hand-back 1

Steps 14-18 are done. The four client gates (typecheck, lint, arch, test) all pass: 442 tests, and the `ProjectContextSection/constants.ts` `truncated` typecheck error is fixed. Nothing is committed.

**Files changed** (all under `/Users/harlock/Downloads/Sites/devdigest/client`):
- **Hook (step 14):**
  - `src/lib/hooks/pr-context.ts` is new. It has `usePrContext`, `useSavePrContext`, `usePrContextPreview` and an `isContextStale(stored, current)` helper.
  - The save is optimistic: it restores the last saved list on error, and its `isPending` is what the tab uses to disable controls while saving.
  - `src/lib/hooks/index.ts` exports it.
- **New components (step 15):** under `src/app/repos/[repoId]/pulls/[number]/_components/`.
  - `ContextTab/` has loading, load error with Retry, not-cloned, empty attachable, and filter-no-match states.
  - `PrContextRow/`, `PrContextFooter/`, `PrContextSuggestions/` and `PrContextPreviewDrawer/` are the other four. The preview uses `SafeMarkdown`.
  - Each folder has the component, `styles.ts` and `index.ts`, plus `constants.ts` or `helpers.ts` where needed.
  - They have no `.test.tsx` files yet.
- **Wiring (step 16):**
  - `PrDetailHeader.tsx` gets a `context` tab after Files changed, with a count badge above zero.
  - `page.tsx` renders `ContextTab` when `tab === "context"` and passes `prId` to `RunTraceDrawer`.
- **Stale notes and Trace (step 17):**
  - `PrBrief.tsx` shows "Generated with different PR context".
  - `IntentCard.tsx` shows a "Classified with different PR context" badge.
  - A null stored fingerprint never counts as stale.
  - `RunTraceDrawer.tsx` gets an optional `prId` prop and a stale note. `ProjectContextSection.tsx` and `ProjectContextSection/helpers.ts` (new) put PR-origin entries first and label them "PR".
  - The `truncated` colour was added to `ProjectContextSection/constants.ts`.
- **i18n (step 18):** `messages/en/` only, because `en` is the only locale in the repo.
  - `prContext.json` is new.
  - `tabs.context` is added to `prReview.json`.
  - `contextStale` is added to `brief.json` and `intent.json`.
  - `runs.json` gets `drawer.contextStale`, `trace.projectContext.originPr` and `status.truncated`.
- **Tests (outside the plan):** I added a `pr-context` hook mock to `IntentCard.test.tsx` and `RunTraceDrawer.test.tsx`. Both components now call `usePrContext` and the tests have no `QueryClientProvider`.

**Deviations and assumptions:**
1. **Run-row stale note moved to the drawer.** `RunSummary` has no `context_fingerprint`, and W1 only added it to `RunTrace`. So "Run used different PR context" shows at the top of the RunTraceDrawer Trace tab, not on the Agent runs row. Putting it on the row needs a `RunSummary` field and a server change.
2. **PR origin string is a guess.** `ProjectContextEntry.origin` in the trace contract is a free string. I treat `"pr"` or `"pr:*"` as a PR-context entry (`PR_ORIGIN` in `ProjectContextSection/helpers.ts`). W2b needs to write that origin, or I change the constant to match.
3. **Preview drawer caveats.** The text is rendered as markdown, not plain `<pre>`. The preview status labels (`preview.status.*`) are my own wording.