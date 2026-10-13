## Hand-back 1

Bug review of `git diff 567ed70`: one WARNING, no CRITICAL. I read the server module (service, routes, repository, helpers, enrichment, clone-files, constants), the client hook `onboarding-tour.ts`, `TourPage.tsx`, and the integration test. I did not run tests, since I was read-only.

| severity | file:line | defect | failing input |
|---|---|---|---|
| WARNING | server/src/modules/onboarding-tour/service.ts:192-196 (with :281-285) | A degraded index overwrites a stored model tour with a skeleton. `generate()` calls `storeSkeleton` unconditionally when `facts.degradedReason` is set. It never checks for an existing `source:'llm'` tour, which `storeFailure` protects under EC-3. | The repo has a stored `source:'llm'` tour. Indexing is then turned off, or the index goes `degraded` or `failed`. Clicking Regenerate makes `collectFacts` return a `degradedReason`. The row is replaced by a skeleton with `meta.source='skeleton'` and `generated_at` reset, and the model-written content is lost with no `last_error`. EC-1 says "produce the skeleton without a model call". It does not say to overwrite a stored model tour. |

The second reading of EC-1 and EC-3 is judgment-dependent, so I rate this 0.6 confidence. If it is deliberate, ignore it. The fix would be to call `storeFailure`-style logic here, which means keeping the stored llm tour and recording the degraded reason in `last_error`.

**Flaky `onboarding-tour.it.test.ts` lead:** I found no service defect. I think it is test isolation and timing, but I did not run it to confirm.
- **Lock Set:** the module-level `generating` Set is keyed by `repoId`, a random UUID per test database. Vitest isolates module state per test file, so the Set cannot leak between files or app instances. Within the file, every path releases the lock, in `.finally` after `storeFailure` or `recordFailure`. The "hang" tests time out through `withTimeout`, so the lock is released.
- **Likely cause:** the file starts two Postgres testcontainers (two `d(...)` blocks) while other `.it` files start theirs in parallel. Under that load, every `settled()` helper gives generation only 100 × 25 ms = 2.5 s to finish, and the no-key test (line 402) has the same limit. One generation includes `scanClone`, tokenizer counting, several DB round trips and the first prompt-template load. That exceeds 2.5 s when the machine is saturated, and `settled` then throws "generation did not settle".
- **Not a production problem:** the real flow never has such a cap. The only mitigation would be a larger or time-based poll budget in the test helper.

**Checked and found correct:**
- `startGenerate` takes the lock synchronously, after the awaits, so concurrent POSTs cannot both pass.
- The client `useOnboardingTour` done-detection is sound. The POST is accepted after the lock is taken, `generated_at` changes on a new tour, and failures that keep it fall back to `!generating && dataUpdatedAt >= pollSince`.
- `mergeGrounded` and `applyHotness` are correct.
- Contract fields the server produces (`generating`, `stale`, `can_use_activity`, `meta.*`) are read consistently by the client.

```findings-json
{
  "reviewer": "bug",
  "findings": [
    {
      "severity": "WARNING",
      "title": "Degraded index overwrites a stored model tour with a skeleton",
      "file": "server/src/modules/onboarding-tour/service.ts",
      "start_line": 192,
      "end_line": 196,
      "rationale": "generate() stores the skeleton unconditionally when facts.degradedReason is set, without checking for an existing source:'llm' tour. The failure paths (storeFailure, EC-3) keep a stored model tour. Regenerating after the index becomes degraded or failed (for example flag_off) replaces an LLM tour with a skeleton, loses its content and resets generated_at. EC-1 only requires 'no model call', not overwriting a stored model tour.",
      "suggestion": "When a stored tour with meta.source === 'llm' exists, keep it and record the degraded reason in meta.last_error/last_error_at (as storeFailure does), and write the skeleton only when no model tour is stored.",
      "confidence": 0.6
    }
  ]
}
```