## Hand-back 1

## Architecture review: server/ + client/ changes in `git diff 567ed70` (onboarding-tour, slices 1-4)

### Deterministic check results
- `cd server && pnpm arch` — PASS. No dependency violations found (189 modules, 646 dependencies cruised).
- `cd client && pnpm arch` — PASS. No dependency violations found (541 modules, 1670 dependencies cruised).
- `e2e/` has only the flow JSON `e2e/specs/10-onboarding-tour.flow.json`. No machine gate exists for that module. It contains no Playwright or chat code, so I found nothing to flag.

### Findings
| Severity | File:Line | Rule | Rationale | Suggestion |
|---|---|---|---|---|
| WARNING | server/src/modules/onboarding-tour/repository.ts:50-59 (`getRanks`) | onion-architecture #10 `[Convention]`, slices not a namespace. Enforced by `no-cross-module-import`, which passes. | The settings read at :41-48 has precedent. `conventions/repository.ts:68-84` does the same, and there is no container-level settings accessor. The `file_rank` read is different: `container.repoIntel` is already used in `service.ts:310-319` for this data. So the "escape hatch" claim only half holds. The module queries `repo-intel`'s table, and `rank` semantics (raw rank, not `percentile`, per AC-10) are duplicated outside the owning module. `repo-intel/repository.ts:448-458` (`getRankedPaths`) already selects path and rank. `getTopFilesByRank` returns paths only, so `getRanks` compensates with a second query. The dependency cruiser does not catch this, because a table-level read is not an import. `file_rank` has no `workspace_id`, so the scoping goes through the `getRepo` check, which is correct. | Expose rank-with-path on `RepoIntelService` (for example a `getTopRanked` returning `{path, rank}[]`). Call it via `container.repoIntel` and drop `getRanks`. If that is deferred, record the `file_rank` read as deliberate debt, not as "the same escape hatch conventions uses". |
| SUGGESTION | server/src/modules/onboarding-tour/repository.ts:38-48 (`getFeatureModelOverride`) | onion-architecture #10 `[Convention]` | The settings read is acceptable and matches the `conventions/repository.ts` precedent. It is still a third copy of the `feature_models` parsing, and it fetches all settings rows and filters in JS. | Optional: when next touched, lift a shared `feature_models` reader into `modules/_shared/`, which `no-cross-module-import` allows. Or add `eq(t.settings.key, 'feature_models')` to the query. |
| SUGGESTION | client/src/app/repos/[repoId]/onboarding-tour/_components/CriticalPathsSection/CriticalPathsSection.tsx:8 | frontend-ui-architecture feature-folder structure (sibling reach-in) | It imports `isActiveRecently` from the sibling component's `../ReadingPathSection/helpers`. The `TourHeader` import of `../RankingToggle` goes through the `index.ts` barrel, so that one is fine. The `helpers` import bypasses the barrel and couples two sections. `pnpm arch` does not flag it. | Move `isActiveRecently` up into a shared helper at the feature root (next to `constants.ts`), or re-export it via the `ReadingPathSection` barrel. |

### Points you asked about, judged with no finding
- **`clone-files.ts` fs IO.** It is allowed. It sits in the module's infra slot, which is not an L0 `helpers` file, so `pure-helpers-stay-pure` does not apply. It reuses `_shared/project-context.ts`, which owns the fs reads and the no-symlink guard. `context/service.ts` and `reviews/run-executor.ts` use the same pattern. `service.ts` (L2) imports it, which is inward-pointing and passes the gate. A small hardening note: it calls `readdir` directly instead of going through the `_shared` helper. That is not a boundary breach.
- **Vendor edits.** No boundary is broken.
  - `GitClient.historyCounts` is declared in `vendor/shared/adapters.ts` and implemented in `adapters/git/simple-git.ts`. The service reaches it via `container.git`, so the port and adapter direction is correct. `core-is-pure` passes.
  - I did not diff the two `contracts/knowledge.ts` copies against each other. The CLAUDE.md drift gotcha (change both in the same commit) is not verified by this review.
- **`flushSync` in `OnThisPage.tsx:4,54,70`.** It is an imperative DOM and scroll-coordination concern, correctly confined to a presentational component. It is commented with AC-13. The lint and cruiser gates pass, and no layering issue applies. The client files have no rule against it.
- **Client feature-folder structure.** It matches the `pulls/` and `context/` precedent. `page.tsx` is a thin entry, and the `_components/*` folders are private. Each has an `index.ts`, `styles.ts`, and `helpers.ts`/`constants.ts` where needed. `lib/hooks/onboarding-tour.ts` is wired through the hooks barrel. There are no cross-feature imports other than shared `@/components` and `@/lib`.

### Grounding note
- Both gate results (`pnpm arch` on server and client) are tool output.
- The three findings rest on the prose in `.claude/skills/onion-architecture/SKILL.md` (rule 10, tagged `[Convention]`, so capped at WARNING) and on my grep and read comparison against `conventions/repository.ts` and `repo-intel/repository.ts`. No machine gate covers them, because table-level access and sibling helper imports are invisible to dependency-cruiser.
- The client SUGGESTION is judged against the feature-folder convention by analogy with the repo's other feature folders. I did not find an explicit rule in the skill text.
- The e2e note rests on `e2e/CLAUDE.md` prose. No gate exists there.

```findings-json
{
  "reviewer": "architecture",
  "findings": [
    {
      "severity": "WARNING",
      "title": "onboarding-tour repository queries repo-intel's file_rank table directly",
      "file": "server/src/modules/onboarding-tour/repository.ts",
      "start_line": 50,
      "end_line": 59,
      "rationale": "onion-architecture rule 10 [Convention]. The settings read has precedent (conventions/repository.ts:68-84), but file_rank is owned by repo-intel, and container.repoIntel is already used in service.ts:310-319. getRanks duplicates repo-intel/repository.ts:448-458 (getRankedPaths) and the AC-10 rank semantics outside the owning module. pnpm arch passes because a table read is not an import.",
      "suggestion": "Expose rank-with-path on RepoIntelService (for example getTopRanked returning {path, rank}[]), call it via container.repoIntel, and delete getRanks. If deferred, document it as deliberate debt.",
      "confidence": 0.8
    },
    {
      "severity": "SUGGESTION",
      "title": "feature_models settings parsing duplicated in a third repository",
      "file": "server/src/modules/onboarding-tour/repository.ts",
      "start_line": 38,
      "end_line": 48,
      "rationale": "Follows the conventions/repository.ts:68-84 precedent, so it is acceptable under rule 10 [Convention]. It copies the parsing and reads all settings rows to pick one key.",
      "suggestion": "Filter by key in the query, or lift a shared feature_models reader into modules/_shared/ when next touched.",
      "confidence": 0.65
    },
    {
      "severity": "SUGGESTION",
      "title": "CriticalPathsSection imports a sibling component's helpers past its barrel",
      "file": "client/src/app/repos/[repoId]/onboarding-tour/_components/CriticalPathsSection/CriticalPathsSection.tsx",
      "start_line": 8,
      "end_line": 8,
      "rationale": "Feature-folder convention by analogy with other feature folders: a component folder's public surface is its index.ts. Importing ../ReadingPathSection/helpers couples two sections. pnpm arch does not flag it.",
      "suggestion": "Move isActiveRecently to a shared helper at the onboarding-tour feature root, or re-export it through the ReadingPathSection barrel.",
      "confidence": 0.6
    }
  ]
}
```