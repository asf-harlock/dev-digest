## Hand-back 1

Round 2 re-review (bug): B1 is fixed and I found no new defects on the lines the fix added or changed.

| id | status | evidence |
|---|---|---|
| B1 | fixed | `server/src/modules/onboarding-tour/service.ts:193-200`. When `facts.degradedReason` is set and a stored `meta.source === 'llm'` tour exists, it calls `setFailure(existing.tour.meta, degradedReason, now)`. It then upserts that tour with `existing.row.generatedAt`. This matches `storeFailure` (lines 287-291) and `recordFailure` (lines 304-307). The skeleton is written only when no model tour is stored. |

New-code checks, all correct:
- **`getTopRanked` (`repo-intel/service.ts:662-675`):**
  - It over-fetches `max(n*10, 100)` rows, applies the same `isJunkPath` and `exclude` filters as `getTopFilesByRank`, sorts by rank DESC then path ASC, and slices to `n`. Ordering and the junk filter are correct.
  - It returns `[]` when `repoIntelEnabled` is false or `n <= 0`.
  - The DB limit orders by rank only, so a tie exactly at the over-fetch boundary could drop paths. The 10× margin makes this negligible, so I am not reporting it.
- **`collectFacts` (`onboarding-tour/service.ts:319-323`):** `.catch(() => [])` covers a throw, and the `[]` result flows to `ranked = []`, matching the old empty-paths path. Both callers (`get` at line 127 and `generate` at line 178) use the new two-argument signature.
- **Removed `getRanks`:** nothing references it any more. The old `?? 0` rank fallback is gone because ranks now come with the paths.
- **`RepoIntel` interface change:** `RepoIntelService` implements `getTopRanked`. The `blast-route` and `conventions` test stubs lack it but are cast with `as unknown as RepoIntel`, so typecheck is unaffected.

```findings-json
{
  "reviewer": "bug",
  "findings": []
}
```