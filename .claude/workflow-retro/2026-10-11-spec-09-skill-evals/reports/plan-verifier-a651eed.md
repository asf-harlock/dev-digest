## Hand-back 1

## Plan verification (pass 2, delta only): SPEC-09 skill evals

Both failed rows are now Pass, and I found no new non-Pass rows.

### Delta matrix
| # | Item | Status | Evidence |
|---|---|---|---|
| C3 | MetricTrend tooltip closes on Escape however it opened, and on pointer-leave into empty plot space | Pass | `client/src/components/metric-trend/MetricTrend/MetricTrend.tsx:47-61`: while a tooltip is open (`isOpen`), a capture-phase `document` `keydown` listener calls `stopPropagation()` and `setActive(null)` on Escape. It is registered only while open, so Escape passes through to a surrounding dialog otherwise. Escape no longer depends on focus. `:149-150`: `onPointerEnter` and `onPointerLeave` are now on each run's own button, and leave only closes if `cur === i`. The old `.plot`-level leave is gone, so leaving a point into empty plot space closes the tooltip. The file header (L8-11) documents this. |
| AC-39 | Open on hover and focus; close on Escape, blur, or focus/pointer moving away | Pass | The new and extended tests in `MetricTrend.test.tsx` all pass. L73-101 cover hover/leave, focus/blur, and focus then Escape, with focus kept on the target. L103-115 cover a hover-only tooltip closing on Escape with `document.activeElement === body`, and Enter leaving it open. L117-136 cover leave from a hovered run, leave from a keyboard-focused run (tooltip closes), and a stale leave from run 1 not closing run 2. L138-156 check that `stopPropagation` is called only while a tooltip is open. |
| T3 | next-intl key-coverage test, and a DiffViewer-level `highlightRange` test | Pass | **Key-coverage test:** `client/src/test/i18n-key-coverage.test.ts` is new and hermetic (file reads only). It scans the SPEC-09 component roots (L17-28), binds `const t = useTranslations("ns")`, and resolves every literal `t("a.b")` key in `messages/en/<ns>.json`. Template keys are checked up to their first `${`. It has three tests: a scanner sanity check (>20 files, >80 uses, spot-checks including `trend.tooltip.skill`), a missing-key check, and a check that no literal key resolves to a group object. All three pass, and the missing-key list is empty. **DiffViewer test:** `DiffViewer.test.tsx` has a new test, "SPEC-09 AC-8: highlightRange…". It renders three files with `highlightRange` `{2,3}` and expects 4 `data-highlighted` lines (lines 2 and 3 in files A and C). The large file B stays collapsed, and `scrollIntoView` is not called. It passes. |
| All other rows | | Pass (unchanged since verify-1) | Includes the three rows that were Unverified in verify-1 (EC-34, NFR-8, UI-12) and T6; this pass did not re-check them, so those four are still Unverified, not Pass. |

### Vendored comment change
- Both `eval-ci.ts` copies carry the same one-line change: ``/** `GET /agents/:id/eval-overview`. `trend` <= 100 chronological; `runs` <= 50 newest first. */``. A grep diff of that line between `client/src/vendor/shared/contracts/eval-ci.ts` and `server/src/vendor/shared/contracts/eval-ci.ts` shows no difference.
- `server/test/eval-contract-parity.test.ts` passes (5/5).
- The two files still differ in other places: the server copy has `CiFailOn` and `AgentManifest`, the client copy does not. That drift existed before this change, and the diff touches neither.

### Gates re-run (my own runs)
- `./scripts/check.sh client typecheck` — PASS
- `./scripts/check.sh client lint` — PASS
- `./scripts/check.sh client arch` — PASS
- `./scripts/check.sh client test` — PASS (670 passed; verify-1 had 663, so 7 more tests)
- `./scripts/check.sh client related` on `MetricTrend.tsx`, `MetricTrend.test.tsx`, `i18n-key-coverage.test.ts` and `DiffViewer.test.tsx` — PASS (78 passed)
- `cd server && pnpm exec vitest run test/eval-contract-parity.test.ts` — PASS (5/5)

### Not covered by the plan
- The empty untracked directory `client/src/app/eval/agents/[agentId]/_components/MetricTrend/` from verify-1: I did not re-check it in this pass.

### Verdict
- C3, AC-39 and T3 move from Fail to Pass, and I found no new non-Pass rows.
- Still open from verify-1 and not re-run: EC-34, NFR-8, UI-12 and T6 are Unverified.
- Spec status: not ready for `Status: implemented` while those four stay Unverified. That edit is yours to make.